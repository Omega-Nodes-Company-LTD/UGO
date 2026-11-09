//! Il testo dentro l'app in primo piano: si mette negli appunti, si preme ⌘V, e
//! si rimette negli appunti quello che c'era prima. Incollare è istantaneo anche
//! per un paragrafo, dove la digitazione simulata scriverebbe lettera per lettera.

use std::thread;
use std::time::Duration;

use arboard::{Clipboard, ImageData};
use enigo::{Direction, Enigo, Key, Keyboard, Settings};

#[cfg(target_os = "macos")]
const PASTE_MODIFIER: Key = Key::Meta;
#[cfg(not(target_os = "macos"))]
const PASTE_MODIFIER: Key = Key::Control;

/// Quanto lasciare all'app di destinazione per leggere gli appunti prima di
/// rimetterci il contenuto di prima: troppo poco e incollerebbe quello vecchio.
const PASTE_SETTLE: Duration = Duration::from_millis(300);

enum Snapshot {
    Text(String),
    Image(ImageData<'static>),
    Nothing,
}

fn snapshot(clipboard: &mut Clipboard) -> Snapshot {
    if let Ok(text) = clipboard.get_text() {
        return Snapshot::Text(text);
    }
    clipboard.get_image().map_or(Snapshot::Nothing, |image| {
        Snapshot::Image(image.to_owned_img())
    })
}

fn restore(clipboard: &mut Clipboard, previous: Snapshot) {
    let _ = match previous {
        Snapshot::Text(text) => clipboard.set_text(text),
        Snapshot::Image(image) => clipboard.set_image(image),
        Snapshot::Nothing => clipboard.clear(),
    };
}

/// Solo negli appunti: quando manca il permesso Accessibilità, il testo non si
/// perde — lo incolla la persona.
pub fn copy_only(text: &str) -> Result<(), String> {
    Clipboard::new()
        .and_then(|mut clipboard| clipboard.set_text(text.to_owned()))
        .map_err(|e| e.to_string())
}

pub fn paste(text: &str) -> Result<(), String> {
    let mut clipboard = Clipboard::new().map_err(|e| e.to_string())?;
    let previous = snapshot(&mut clipboard);
    clipboard
        .set_text(text.to_owned())
        .map_err(|e| e.to_string())?;
    thread::sleep(Duration::from_millis(60));
    let pressed = press_paste();
    thread::sleep(PASTE_SETTLE);
    restore(&mut clipboard, previous);
    pressed
}

fn press_paste() -> Result<(), String> {
    let mut enigo = Enigo::new(&Settings::default()).map_err(|e| e.to_string())?;
    enigo
        .key(PASTE_MODIFIER, Direction::Press)
        .map_err(|e| e.to_string())?;
    let typed = enigo
        .key(Key::Unicode('v'), Direction::Click)
        .map_err(|e| e.to_string());
    // il modificatore si rilascia sempre: un ⌘ rimasto premuto rovina la tastiera
    enigo
        .key(PASTE_MODIFIER, Direction::Release)
        .map_err(|e| e.to_string())?;
    typed
}
