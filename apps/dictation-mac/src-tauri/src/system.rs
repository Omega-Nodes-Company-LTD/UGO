//! Quello che dipende dal sistema operativo: il permesso Accessibilità e
//! l'altoparlante.

/// Senza Accessibilità macOS non lascia premere ⌘V per un'altra app. Con
/// `prompt` il sistema mostra il suo dialogo, che porta alle Impostazioni.
#[cfg(target_os = "macos")]
pub fn accessibility_trusted(prompt: bool) -> bool {
    if prompt {
        macos_accessibility_client::accessibility::application_is_trusted_with_prompt()
    } else {
        macos_accessibility_client::accessibility::application_is_trusted()
    }
}

#[cfg(not(target_os = "macos"))]
pub fn accessibility_trusted(_prompt: bool) -> bool {
    true
}

/// La risposta di UGO, a voce. In un thread suo: l'uscita audio di rodio non
/// si sposta fra thread, e chi l'ha chiesta non deve aspettare la fine.
pub fn play_mp3(mp3: Vec<u8>) {
    std::thread::spawn(move || {
        let Ok((_stream, handle)) = rodio::OutputStream::try_default() else {
            return;
        };
        let Ok(sink) = rodio::Sink::try_new(&handle) else {
            return;
        };
        if let Ok(source) = rodio::Decoder::new(std::io::Cursor::new(mp3)) {
            sink.append(source);
            sink.sleep_until_end();
        }
    });
}
