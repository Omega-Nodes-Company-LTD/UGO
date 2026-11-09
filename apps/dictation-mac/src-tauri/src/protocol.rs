//! Le richieste a soul e la lettura delle risposte, separate dalla rete: sono la
//! parte che si sbaglia, e qui si provano senza un server finto.

use base64::Engine as _;
use serde::Deserialize;
use serde_json::json;

use crate::audio::pcm16_le_bytes;

pub const DEFAULT_BASE_URL: &str = "https://ugo.omeganodes.ai";
/// Il tetto di `/v1/chat` (`chatRequestSchema`, 2000 caratteri).
const MAX_CHAT_CHARS: usize = 2000;
/// Il tetto di `/v1/tts` (300 caratteri): oltre, la voce legge solo l'inizio.
const MAX_TTS_CHARS: usize = 300;
/// Il codice di abbinamento del contratto C1: 8 caratteri.
const PAIR_CODE_LEN: usize = 8;

/// Il corpo di `POST /v1/stt`: PCM16 little-endian in base64.
pub fn stt_body(pcm: &[i16]) -> String {
    let audio = base64::engine::general_purpose::STANDARD.encode(pcm16_le_bytes(pcm));
    json!({ "audio": audio }).to_string()
}

/// I «no» della dettatura non sono tutti lo stesso no (vedi `stt.ts`).
#[derive(Debug, PartialEq, Eq)]
pub enum SttOutcome {
    Text(String),
    /// questo clip non si trascrive (422): si lascia perdere il clip, non la strada
    Unusable,
    /// whisper giù o lento (503): riprovare più tardi
    Down,
    /// la dettatura non è accesa su questo server (501)
    NotConfigured,
    /// il token non vale più (401/403): serve un nuovo abbinamento
    Unauthorized,
    Unexpected(u16),
}

#[derive(Deserialize)]
struct SttText {
    text: String,
}

pub fn read_stt(status: u16, body: &str) -> SttOutcome {
    match status {
        200 => serde_json::from_str::<SttText>(body)
            .map(|parsed| SttOutcome::Text(parsed.text))
            .unwrap_or(SttOutcome::Unexpected(200)),
        422 => SttOutcome::Unusable,
        503 => SttOutcome::Down,
        501 => SttOutcome::NotConfigured,
        401 | 403 => SttOutcome::Unauthorized,
        other => SttOutcome::Unexpected(other),
    }
}

/// Il codice come lo scrive una persona («abcd-1234», «ABCD 1234») nella forma
/// che il server conosce. `None` se non può essere un codice.
pub fn normalize_pair_code(input: &str) -> Option<String> {
    let code: String = input
        .chars()
        .filter(|c| !c.is_whitespace() && *c != '-')
        .map(|c| c.to_ascii_uppercase())
        .collect();
    (code.len() == PAIR_CODE_LEN && code.chars().all(|c| c.is_ascii_alphanumeric())).then_some(code)
}

pub fn pair_body(code: &str, device_label: &str) -> String {
    json!({ "code": code, "deviceLabel": device_label }).to_string()
}

#[derive(Debug, PartialEq, Eq)]
pub enum PairOutcome {
    Paired(String),
    /// codice sbagliato o scaduto
    Refused,
    /// troppi tentativi: il server ne accetta pochi al minuto
    TooMany,
    Unexpected(u16),
}

#[derive(Deserialize)]
struct PairToken {
    token: String,
}

pub fn read_pair(status: u16, body: &str) -> PairOutcome {
    match status {
        200 | 201 => serde_json::from_str::<PairToken>(body)
            .ok()
            .filter(|parsed| !parsed.token.is_empty())
            .map_or(PairOutcome::Unexpected(status), |parsed| {
                PairOutcome::Paired(parsed.token)
            }),
        400 | 401 | 403 | 404 | 410 => PairOutcome::Refused,
        429 => PairOutcome::TooMany,
        other => PairOutcome::Unexpected(other),
    }
}

fn truncate_chars(text: &str, max: usize) -> String {
    text.chars().take(max).collect()
}

/// La domanda a UGO dalla scrivania: canale `api`, lo stesso di chi gli scrive da
/// un programma, non quello di casa né della reception.
pub fn chat_body(text: &str) -> String {
    json!({ "channel": "api", "text": truncate_chars(text.trim(), MAX_CHAT_CHARS) }).to_string()
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ChatReply {
    reply: String,
    mood_label: String,
}

/// La risposta e l'umore con cui la dice (l'umore colora la voce, ADR-126).
pub fn read_chat(status: u16, body: &str) -> Option<(String, String)> {
    if status != 200 {
        return None;
    }
    serde_json::from_str::<ChatReply>(body)
        .ok()
        .map(|parsed| (parsed.reply, parsed.mood_label))
}

pub fn tts_body(text: &str, mood: &str) -> String {
    json!({ "text": truncate_chars(text.trim(), MAX_TTS_CHARS), "mood": mood }).to_string()
}

/// L'indirizzo di una rotta, senza doppie barre se la base finisce con una.
pub fn endpoint(base_url: &str, path: &str) -> String {
    format!("{}{}", base_url.trim_end_matches('/'), path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stt_body_carries_little_endian_pcm_in_base64() {
        let body: serde_json::Value = serde_json::from_str(&stt_body(&[1, -2])).unwrap();
        let audio = body["audio"].as_str().unwrap();
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(audio)
            .unwrap();
        assert_eq!(bytes, vec![1, 0, 0xfe, 0xff]);
    }

    #[test]
    fn eleven_seconds_fit_under_the_soul_cap() {
        // stt.ts: MAX_STT_B64_CHARS = 520_000, più l'involucro JSON
        let clip = vec![0_i16; crate::audio::MAX_CLIP_SAMPLES];
        assert!(stt_body(&clip).len() < 520_000);
    }

    #[test]
    fn the_stt_answers_are_told_apart() {
        assert_eq!(
            read_stt(200, r#"{"text":"ciao"}"#),
            SttOutcome::Text("ciao".into())
        );
        assert_eq!(read_stt(422, ""), SttOutcome::Unusable);
        assert_eq!(read_stt(503, ""), SttOutcome::Down);
        assert_eq!(read_stt(501, ""), SttOutcome::NotConfigured);
        assert_eq!(read_stt(401, ""), SttOutcome::Unauthorized);
        assert_eq!(read_stt(200, "non json"), SttOutcome::Unexpected(200));
        assert_eq!(read_stt(500, ""), SttOutcome::Unexpected(500));
    }

    #[test]
    fn a_pair_code_is_read_the_way_people_type_it() {
        assert_eq!(
            normalize_pair_code("abcd-1234").as_deref(),
            Some("ABCD1234")
        );
        assert_eq!(
            normalize_pair_code(" AB CD 12 34 ").as_deref(),
            Some("ABCD1234")
        );
        assert_eq!(normalize_pair_code("abc"), None);
        assert_eq!(normalize_pair_code("abcd-123!"), None);
    }

    #[test]
    fn pairing_reads_the_token_or_says_why_not() {
        assert_eq!(
            read_pair(200, r#"{"token":"t0k"}"#),
            PairOutcome::Paired("t0k".into())
        );
        assert_eq!(
            read_pair(200, r#"{"token":""}"#),
            PairOutcome::Unexpected(200)
        );
        assert_eq!(read_pair(410, ""), PairOutcome::Refused);
        assert_eq!(read_pair(429, ""), PairOutcome::TooMany);
        let body: serde_json::Value =
            serde_json::from_str(&pair_body("ABCD1234", "Mac di casa")).unwrap();
        assert_eq!(body["deviceLabel"], "Mac di casa");
    }

    #[test]
    fn chat_goes_on_the_api_channel_within_the_cap() {
        let long = "a".repeat(5000);
        let body: serde_json::Value = serde_json::from_str(&chat_body(&long)).unwrap();
        assert_eq!(body["channel"], "api");
        assert_eq!(body["text"].as_str().unwrap().chars().count(), 2000);
        assert_eq!(
            read_chat(
                200,
                r#"{"reply":"Grunf!","moodLabel":"gasato","memoriesUsed":[]}"#
            ),
            Some(("Grunf!".into(), "gasato".into()))
        );
        assert_eq!(read_chat(503, ""), None);
    }

    #[test]
    fn tts_is_capped_and_endpoints_join_cleanly() {
        let body: serde_json::Value =
            serde_json::from_str(&tts_body(&"è".repeat(400), "sereno")).unwrap();
        assert_eq!(body["text"].as_str().unwrap().chars().count(), 300);
        assert_eq!(
            endpoint("https://ugo.omeganodes.ai/", "/v1/stt"),
            "https://ugo.omeganodes.ai/v1/stt"
        );
        assert_eq!(
            endpoint(DEFAULT_BASE_URL, "/v1/pair"),
            "https://ugo.omeganodes.ai/v1/pair"
        );
    }
}
