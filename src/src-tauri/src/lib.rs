//! ION Screen Capture - Tauri backend composition root.

mod commands;
mod discovery;
mod error;
mod events;
mod hotkey;
mod image_out;
mod instrument;
mod state;
mod transport;

use tauri::Manager;

use state::AppState;

/// settings.json key holding whether the window was maximized when last used.
/// Implicit window state rather than a user preference, so it is deliberately
/// not surfaced in the Settings dialog.
const MAXIMIZED_KEY: &str = "windowMaximized";

fn stored_maximized(app: &tauri::AppHandle) -> bool {
    use tauri_plugin_store::StoreExt;
    app.store("settings.json")
        .ok()
        .and_then(|s| s.get(MAXIMIZED_KEY))
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
}

/// Build and run the Tauri application.
pub fn run() {
    #[allow(unused_mut)]
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_opener::init());

    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_global_shortcut::Builder::new().build());
    }

    builder
        .manage(AppState::default())
        .setup(|app| {
            // Arm the capture hotkey if it was enabled in a previous session
            // (fixes the legacy bug where the hotkey never armed at startup).
            use tauri_plugin_store::StoreExt;
            let enabled = app
                .store("settings.json")
                .ok()
                .and_then(|s| s.get("hotkeyEnabled"))
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            if enabled {
                let _ = hotkey::set_enabled(app.handle(), true);
            }

            // Reopen maximized if that is how it was left. The not-maximized
            // case needs nothing here: `center` in tauri.conf.json has already
            // placed the window.
            if stored_maximized(app.handle()) {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.maximize();
                }
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            // `Resized` covers maximize and unmaximize, but it also fires on
            // every frame of a drag-resize, so write only when the flag actually
            // changes. That keeps the store quiet, and unlike saving on close it
            // cannot be lost if the process is killed: the value reaches disk the
            // moment the user maximizes.
            if !matches!(event, tauri::WindowEvent::Resized(_)) {
                return;
            }
            let Ok(is_max) = window.is_maximized() else {
                return;
            };
            let app = window.app_handle();
            if is_max == stored_maximized(app) {
                return;
            }
            use tauri_plugin_store::StoreExt;
            if let Ok(store) = app.store("settings.json") {
                store.set(MAXIMIZED_KEY, is_max);
                // set() schedules a 100 ms debounced auto-save; flush now so a
                // close immediately after maximizing cannot beat it.
                let _ = store.save();
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::connection::connect,
            commands::connection::disconnect,
            commands::connection::connection_status,
            commands::capture::capture,
            commands::capture::copy_last_capture,
            commands::capture::save_last_capture,
            commands::capture::finalize_reduced_capture,
            commands::capture::abandon_reduction,
            commands::discovery::start_discovery,
            commands::discovery::cancel_discovery,
            commands::discovery::list_interfaces,
            hotkey::set_hotkey,
            hotkey::set_shortcut,
        ])
        .run(tauri::generate_context!())
        .expect("error while running ION Screen Capture");
}
