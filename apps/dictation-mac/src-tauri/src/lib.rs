//! UGO Dettatura (ADR-129): detta in qualunque app del Mac. L'audio va al
//! faster-whisper di UGO (`/v1/stt`) e il testo torna nell'app in primo piano.

mod audio;
mod capture;
mod client;
mod config;
mod flow;
mod insert;
mod keychain;
mod protocol;
mod system;
mod transcript;

use std::sync::Mutex;

use serde::Serialize;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Manager, RunEvent, State, WindowEvent};
use tauri_plugin_global_shortcut::GlobalShortcutExt;

use config::{parse_shortcut, Settings};
use flow::{show, AppState};
use protocol::{normalize_pair_code, PairOutcome};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Status {
    paired: bool,
    accessibility: bool,
    settings: Settings,
}

#[tauri::command]
fn get_status(state: State<'_, AppState>) -> Status {
    Status {
        paired: keychain::load().is_some(),
        accessibility: system::accessibility_trusted(false),
        settings: state.settings.lock().map(|s| s.clone()).unwrap_or_default(),
    }
}

fn register_shortcuts(app: &AppHandle, settings: &Settings) -> Result<(), String> {
    let shortcuts = app.global_shortcut();
    shortcuts.unregister_all().map_err(|e| e.to_string())?;
    for text in [&settings.dictate_shortcut, &settings.answer_shortcut] {
        shortcuts
            .register(parse_shortcut(text)?)
            .map_err(|e| format!("{text}: {e}"))?;
    }
    Ok(())
}

#[tauri::command]
fn save_settings(
    app: AppHandle,
    state: State<'_, AppState>,
    settings: Settings,
) -> Result<(), String> {
    config::save(&state.settings_path, &settings)?;
    register_shortcuts(&app, &settings)?;
    if let Ok(mut current) = state.settings.lock() {
        *current = settings;
    }
    Ok(())
}

#[tauri::command]
async fn pair_device(state: State<'_, AppState>, code: String) -> Result<(), String> {
    let Some(code) = normalize_pair_code(&code) else {
        return Err("il codice è di 8 caratteri, lettere e numeri".to_owned());
    };
    let (base, label) = state
        .settings
        .lock()
        .map(|s| (s.base_url.clone(), s.device_label.clone()))
        .map_err(|e| e.to_string())?;
    match state.ugo.pair(&base, &code, &label).await {
        PairOutcome::Paired(token) => keychain::save(&token),
        PairOutcome::Refused => {
            Err("codice sbagliato o scaduto: chiedine uno nuovo dal pannello".to_owned())
        }
        PairOutcome::TooMany => Err("troppi tentativi: aspetta un minuto".to_owned()),
        PairOutcome::Unexpected(0) => Err("UGO non è raggiungibile da qui".to_owned()),
        PairOutcome::Unexpected(code) => Err(format!("risposta inattesa da UGO ({code})")),
    }
}

#[tauri::command]
fn unpair_device() {
    keychain::clear();
}

#[tauri::command]
fn request_accessibility() -> bool {
    system::accessibility_trusted(true)
}

fn build_tray(app: &tauri::App) -> tauri::Result<()> {
    let pair = MenuItem::with_id(app, "pair", "Abbina a UGO…", true, None::<&str>)?;
    let settings = MenuItem::with_id(app, "settings", "Impostazioni…", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "Esci da UGO Dettatura", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&pair, &settings, &separator, &quit])?;
    let mut tray = TrayIconBuilder::with_id("main")
        .tooltip("UGO Dettatura")
        .menu(&menu);
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.on_menu_event(|app, event| match event.id.as_ref() {
        "pair" => show(app, "pair"),
        "settings" => show(app, "settings"),
        "quit" => app.exit(0),
        _ => {}
    })
    .build(app)?;
    Ok(())
}

pub fn run() {
    let app = tauri::Builder::default()
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    flow::on_shortcut(app, shortcut, event.state())
                })
                .build(),
        )
        .setup(|app| {
            // un'app da barra dei menu: niente icona nel Dock
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);
            let settings_path = app.path().app_config_dir()?.join("settings.json");
            let settings = config::load(&settings_path);
            app.manage(AppState {
                settings: Mutex::new(settings.clone()),
                settings_path,
                recorder: capture::Recorder::spawn(),
                recording: Mutex::new(None),
                ugo: client::Ugo::new().map_err(std::io::Error::other)?,
            });
            build_tray(app)?;
            if let Err(error) = register_shortcuts(app.handle(), &settings) {
                flow::status(
                    app.handle(),
                    &format!("scorciatoia non registrata: {error}"),
                );
                show(app.handle(), "settings");
            }
            if keychain::load().is_none() {
                show(app.handle(), "pair");
            } else if !system::accessibility_trusted(true) {
                show(app.handle(), "permissions");
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            // chiudere la finestra la nasconde: l'app vive nella barra dei menu
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_status,
            save_settings,
            pair_device,
            unpair_device,
            request_accessibility
        ])
        .build(tauri::generate_context!())
        .expect("UGO Dettatura non è riuscita ad avviarsi");
    app.run(|_, event| {
        // senza finestre visibili l'app resta viva; si esce solo dal menu
        if let RunEvent::ExitRequested {
            api, code: None, ..
        } = event
        {
            api.prevent_exit();
        }
    });
}
