// niente console su Windows in release; su macOS non cambia niente
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    ugo_dictation::run();
}
