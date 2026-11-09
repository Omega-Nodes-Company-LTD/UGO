//! Il token del dispositivo, nel Portachiavi di macOS (mai in un file).

const SERVICE: &str = "ai.omeganodes.dictation";
const ACCOUNT: &str = "ugo-device-token";

fn entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new(SERVICE, ACCOUNT).map_err(|e| e.to_string())
}

pub fn load() -> Option<String> {
    entry()
        .ok()?
        .get_password()
        .ok()
        .filter(|token| !token.is_empty())
}

pub fn save(token: &str) -> Result<(), String> {
    entry()?.set_password(token).map_err(|e| e.to_string())
}

/// Un token revocato dal pannello si toglie anche da qui: tenerlo farebbe
/// fallire in silenzio ogni dettatura successiva.
pub fn clear() {
    if let Ok(entry) = entry() {
        let _ = entry.delete_credential();
    }
}
