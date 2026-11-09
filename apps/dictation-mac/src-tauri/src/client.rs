//! La rete verso soul. La forma delle richieste e la lettura delle risposte
//! stanno in `protocol.rs`; qui c'è solo il viaggio.

use std::time::Duration;

use crate::protocol::{
    chat_body, endpoint, pair_body, read_chat, read_pair, read_stt, stt_body, tts_body,
    PairOutcome, SttOutcome,
};

pub struct Ugo {
    http: reqwest::Client,
}

struct Answer {
    status: u16,
    audio: bool,
    body: Vec<u8>,
}

impl Ugo {
    pub fn new() -> Result<Self, String> {
        let http = reqwest::Client::builder()
            .timeout(Duration::from_secs(30))
            .user_agent(concat!("ugo-dictation/", env!("CARGO_PKG_VERSION")))
            .build()
            .map_err(|e| e.to_string())?;
        Ok(Self { http })
    }

    async fn post(&self, url: String, token: Option<&str>, body: String) -> Result<Answer, String> {
        let mut request = self
            .http
            .post(url)
            .header("content-type", "application/json")
            .body(body);
        if let Some(token) = token {
            request = request.bearer_auth(token);
        }
        let response = request.send().await.map_err(|e| e.to_string())?;
        let status = response.status().as_u16();
        let audio = response
            .headers()
            .get("content-type")
            .and_then(|value| value.to_str().ok())
            .is_some_and(|value| value.starts_with("audio/"));
        let body = response.bytes().await.map_err(|e| e.to_string())?.to_vec();
        Ok(Answer {
            status,
            audio,
            body,
        })
    }

    pub async fn transcribe(&self, base: &str, token: &str, clip: &[i16]) -> SttOutcome {
        match self
            .post(endpoint(base, "/v1/stt"), Some(token), stt_body(clip))
            .await
        {
            Ok(answer) => read_stt(answer.status, &String::from_utf8_lossy(&answer.body)),
            // senza rete è come whisper giù: si riprova, non si cambia strada
            Err(_) => SttOutcome::Down,
        }
    }

    pub async fn pair(&self, base: &str, code: &str, label: &str) -> PairOutcome {
        match self
            .post(endpoint(base, "/v1/pair"), None, pair_body(code, label))
            .await
        {
            Ok(answer) => read_pair(answer.status, &String::from_utf8_lossy(&answer.body)),
            Err(_) => PairOutcome::Unexpected(0),
        }
    }

    pub async fn ask(&self, base: &str, token: &str, text: &str) -> Option<(String, String)> {
        let answer = self
            .post(endpoint(base, "/v1/chat"), Some(token), chat_body(text))
            .await
            .ok()?;
        read_chat(answer.status, &String::from_utf8_lossy(&answer.body))
    }

    /// La voce del gosino (ADR-126). `None` = si mostra solo il testo: un 204 di
    /// soul vuol dire «arrangiati», e qui arrangiarsi è non parlare.
    pub async fn speak(&self, base: &str, token: &str, text: &str, mood: &str) -> Option<Vec<u8>> {
        let answer = self
            .post(endpoint(base, "/v1/tts"), Some(token), tts_body(text, mood))
            .await
            .ok()?;
        (answer.status == 200 && answer.audio).then_some(answer.body)
    }
}
