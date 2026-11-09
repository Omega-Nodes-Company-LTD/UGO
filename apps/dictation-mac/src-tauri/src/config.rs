//! Le impostazioni dell'app: dove sta UGO, come si tiene la scorciatoia, quali
//! scorciatoie. Il token NON sta qui: sta nel Portachiavi (`keychain.rs`).

use std::path::Path;

use serde::{Deserialize, Serialize};
use tauri_plugin_global_shortcut::Shortcut;

use crate::protocol::DEFAULT_BASE_URL;

/// ⌃⌥D e ⌃⌥R, e non Fn: vedi ADR-129. Fn da solo non si registra come
/// scorciatoia globale (servirebbe un event tap con il permesso «Monitoraggio
/// input») e su macOS è già la dettatura di Apple; ⌥⌘D nasconde il Dock, ⌃⌘D è
/// «Cerca nel dizionario», e le combinazioni con ⌘ sono quasi tutte dei browser.
pub const DEFAULT_DICTATE_SHORTCUT: &str = "Control+Alt+KeyD";
pub const DEFAULT_ANSWER_SHORTCUT: &str = "Control+Alt+KeyR";

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Mode {
    /// tieni premuta la scorciatoia mentre parli
    Hold,
    /// premi per cominciare, premi per finire
    Toggle,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub base_url: String,
    pub mode: Mode,
    pub dictate_shortcut: String,
    pub answer_shortcut: String,
    pub device_label: String,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            base_url: DEFAULT_BASE_URL.to_owned(),
            mode: Mode::Hold,
            dictate_shortcut: DEFAULT_DICTATE_SHORTCUT.to_owned(),
            answer_shortcut: DEFAULT_ANSWER_SHORTCUT.to_owned(),
            device_label: "Mac".to_owned(),
        }
    }
}

pub fn parse_shortcut(text: &str) -> Result<Shortcut, String> {
    text.parse::<Shortcut>()
        .map_err(|_| format!("«{text}» non è una scorciatoia valida (esempio: Control+Alt+KeyD)"))
}

impl Settings {
    /// Le regole che un file d'impostazioni deve rispettare prima di essere usato.
    pub fn validate(&self) -> Result<(), String> {
        let local = self.base_url.starts_with("http://localhost")
            || self.base_url.starts_with("http://127.0.0.1");
        if !self.base_url.starts_with("https://") && !local {
            // il token viaggia nell'intestazione: in chiaro solo verso questa macchina
            return Err("l'indirizzo di UGO deve cominciare con https://".to_owned());
        }
        let dictate = parse_shortcut(&self.dictate_shortcut)?;
        let answer = parse_shortcut(&self.answer_shortcut)?;
        if dictate.id() == answer.id() {
            return Err("le due scorciatoie devono essere diverse".to_owned());
        }
        if self.device_label.trim().is_empty() || self.device_label.chars().count() > 60 {
            return Err("il nome di questo Mac deve avere fra 1 e 60 caratteri".to_owned());
        }
        Ok(())
    }
}

/// Un file mancante o rovinato non ferma l'app: valgono i default, e si dice.
pub fn load(path: &Path) -> Settings {
    std::fs::read_to_string(path)
        .ok()
        .and_then(|text| serde_json::from_str::<Settings>(&text).ok())
        .filter(|settings| settings.validate().is_ok())
        .unwrap_or_default()
}

pub fn save(path: &Path, settings: &Settings) -> Result<(), String> {
    settings.validate()?;
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let text = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    std::fs::write(path, text).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_defaults_are_valid_and_point_at_ugo() {
        let settings = Settings::default();
        assert!(settings.validate().is_ok());
        assert_eq!(settings.base_url, "https://ugo.omeganodes.ai");
        assert_eq!(settings.mode, Mode::Hold);
    }

    #[test]
    fn plain_http_is_refused_except_towards_this_machine() {
        let mut settings = Settings {
            base_url: "http://ugo.omeganodes.ai".into(),
            ..Settings::default()
        };
        assert!(settings.validate().is_err());
        settings.base_url = "http://localhost:3000".into();
        assert!(settings.validate().is_ok());
    }

    #[test]
    fn shortcuts_must_parse_and_differ() {
        let bad = Settings {
            dictate_shortcut: "Boh+Q".into(),
            ..Settings::default()
        };
        assert!(bad.validate().is_err());
        let same = Settings {
            answer_shortcut: DEFAULT_DICTATE_SHORTCUT.into(),
            ..Settings::default()
        };
        assert!(same.validate().is_err());
    }

    #[test]
    fn a_missing_or_broken_file_falls_back_to_defaults_and_a_saved_one_roundtrips() {
        let dir = std::env::temp_dir().join(format!("ugo-dictation-test-{}", std::process::id()));
        let path = dir.join("settings.json");
        assert_eq!(load(&path), Settings::default());
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(&path, "{ rotto").unwrap();
        assert_eq!(load(&path), Settings::default());
        let mine = Settings {
            mode: Mode::Toggle,
            device_label: "MacBook di Fra".into(),
            ..Settings::default()
        };
        save(&path, &mine).unwrap();
        assert_eq!(load(&path), mine);
        // un file vecchio senza un campo nuovo prende il default di quel campo
        std::fs::write(&path, r#"{"mode":"toggle"}"#).unwrap();
        assert_eq!(load(&path).mode, Mode::Toggle);
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
