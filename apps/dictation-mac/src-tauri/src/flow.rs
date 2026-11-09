//! Cosa succede quando si preme la scorciatoia: ascolto → trascrizione → testo
//! nell'app in primo piano (dettatura) oppure domanda a UGO (risposta).

use std::sync::Mutex;

use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_global_shortcut::{Shortcut, ShortcutState};

use crate::audio::split_clips;
use crate::capture::Recorder;
use crate::client::Ugo;
use crate::config::{parse_shortcut, Mode, Settings};
use crate::protocol::SttOutcome;
use crate::transcript::join_parts;
use crate::{insert, keychain, system};

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Purpose {
    Dictate,
    Answer,
}

pub struct AppState {
    pub settings: Mutex<Settings>,
    pub settings_path: std::path::PathBuf,
    pub recorder: Recorder,
    pub recording: Mutex<Option<Purpose>>,
    pub ugo: Ugo,
}

/// Una riga di stato: nel suggerimento dell'icona e nella finestra, se aperta.
pub fn status(app: &AppHandle, text: &str) {
    if let Some(tray) = app.tray_by_id("main") {
        let _ = tray.set_tooltip(Some(format!("UGO Dettatura — {text}")));
    }
    let _ = app.emit("status", text);
}

pub fn show(app: &AppHandle, section: &str) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = app.emit("section", section);
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn purpose_of(settings: &Settings, pressed: &Shortcut) -> Option<Purpose> {
    let is = |text: &str| parse_shortcut(text).is_ok_and(|shortcut| shortcut.id() == pressed.id());
    if is(&settings.dictate_shortcut) {
        Some(Purpose::Dictate)
    } else if is(&settings.answer_shortcut) {
        Some(Purpose::Answer)
    } else {
        None
    }
}

pub fn on_shortcut(app: &AppHandle, pressed: &Shortcut, state: ShortcutState) {
    let shared = app.state::<AppState>();
    let settings = shared
        .settings
        .lock()
        .map(|s| s.clone())
        .unwrap_or_default();
    let Some(purpose) = purpose_of(&settings, pressed) else {
        return;
    };
    let recording = shared.recording.lock().map(|r| *r).unwrap_or(None);
    match (settings.mode, state, recording) {
        (Mode::Hold, ShortcutState::Pressed, None)
        | (Mode::Toggle, ShortcutState::Pressed, None) => {
            begin(app, purpose);
        }
        (Mode::Hold, ShortcutState::Released, Some(_))
        | (Mode::Toggle, ShortcutState::Pressed, Some(_)) => {
            finish(app);
        }
        _ => {}
    }
}

fn begin(app: &AppHandle, purpose: Purpose) {
    if keychain::load().is_none() {
        status(app, "abbina prima questo Mac a UGO");
        show(app, "pair");
        return;
    }
    let shared = app.state::<AppState>();
    match shared.recorder.start() {
        Ok(()) => {
            if let Ok(mut recording) = shared.recording.lock() {
                *recording = Some(purpose);
            }
            if let Some(tray) = app.tray_by_id("main") {
                let _ = tray.set_title(Some("●"));
            }
            status(
                app,
                if purpose == Purpose::Dictate {
                    "ti ascolto…"
                } else {
                    "ti ascolto, poi ti risponde UGO…"
                },
            );
        }
        Err(error) => status(app, &format!("microfono non disponibile: {error}")),
    }
}

fn finish(app: &AppHandle) {
    let shared = app.state::<AppState>();
    let purpose = shared.recording.lock().ok().and_then(|mut r| r.take());
    let pcm = shared.recorder.stop();
    if let Some(tray) = app.tray_by_id("main") {
        let _ = tray.set_title(None::<&str>);
    }
    let Some(purpose) = purpose else { return };
    let app = app.clone();
    tauri::async_runtime::spawn(async move { process(&app, purpose, pcm).await });
}

async fn process(app: &AppHandle, purpose: Purpose, pcm: Vec<i16>) {
    let shared = app.state::<AppState>();
    let base = shared
        .settings
        .lock()
        .map(|s| s.base_url.clone())
        .unwrap_or_default();
    let Some(token) = keychain::load() else {
        return;
    };
    let clips = split_clips(&pcm);
    if clips.is_empty() {
        status(app, "troppo corto, non ho sentito niente");
        return;
    }
    status(app, "trascrivo…");
    let mut parts = Vec::new();
    for clip in clips {
        match shared.ugo.transcribe(&base, &token, clip).await {
            SttOutcome::Text(text) => parts.push(text),
            SttOutcome::Unusable => {}
            SttOutcome::Down => {
                return status(app, "la trascrizione di UGO non risponde adesso: riprova")
            }
            SttOutcome::NotConfigured => {
                return status(app, "la dettatura non è accesa su questo UGO")
            }
            SttOutcome::Unauthorized => {
                keychain::clear();
                show(app, "pair");
                return status(app, "questo Mac non è più abbinato: serve un codice nuovo");
            }
            SttOutcome::Unexpected(code) => {
                return status(app, &format!("risposta inattesa da UGO ({code})"))
            }
        }
    }
    let text = join_parts(&parts);
    if text.is_empty() {
        return status(app, "non ho capito niente da scrivere");
    }
    match purpose {
        Purpose::Dictate => deliver(app, text).await,
        Purpose::Answer => answer(app, &base, &token, &text).await,
    }
}

async fn deliver(app: &AppHandle, text: String) {
    let trusted = system::accessibility_trusted(false);
    let outcome = tauri::async_runtime::spawn_blocking(move || {
        if trusted {
            insert::paste(&text)
        } else {
            insert::copy_only(&text)
        }
    })
    .await;
    match (trusted, outcome) {
        (true, Ok(Ok(()))) => status(app, "scritto"),
        (false, Ok(Ok(()))) => {
            status(
                app,
                "negli appunti: concedi l'Accessibilità per incollarlo da solo",
            );
            show(app, "permissions");
        }
        (_, Ok(Err(error))) => status(app, &format!("non sono riuscito a scriverlo: {error}")),
        (_, Err(error)) => status(app, &format!("non sono riuscito a scriverlo: {error}")),
    }
}

async fn answer(app: &AppHandle, base: &str, token: &str, question: &str) {
    let shared = app.state::<AppState>();
    status(app, "UGO ci pensa…");
    let Some((reply, mood)) = shared.ugo.ask(base, token, question).await else {
        return status(app, "UGO non ha risposto adesso");
    };
    let _ = app.emit(
        "reply",
        serde_json::json!({ "question": question, "reply": reply }),
    );
    show(app, "reply");
    status(app, "UGO ha risposto");
    if let Some(mp3) = shared.ugo.speak(base, token, &reply, &mood).await {
        system::play_mp3(mp3);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_shortcut_is_matched_to_its_purpose() {
        let settings = Settings::default();
        let dictate = parse_shortcut(&settings.dictate_shortcut).unwrap();
        let answer = parse_shortcut(&settings.answer_shortcut).unwrap();
        let other = parse_shortcut("Control+Alt+KeyZ").unwrap();
        assert_eq!(purpose_of(&settings, &dictate), Some(Purpose::Dictate));
        assert_eq!(purpose_of(&settings, &answer), Some(Purpose::Answer));
        assert_eq!(purpose_of(&settings, &other), None);
    }
}
