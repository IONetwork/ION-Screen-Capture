//! ION Screen Capture - Tauri backend composition root.

mod commands;
mod discovery;
mod error;
mod events;
mod hotkey;
mod instrument;
mod state;
mod transport;

use state::AppState;

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
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::connection::connect,
            commands::connection::disconnect,
            commands::connection::connection_status,
            commands::capture::capture,
            commands::capture::copy_last_capture,
            commands::capture::save_last_capture,
            commands::discovery::start_discovery,
            commands::discovery::cancel_discovery,
            commands::discovery::list_interfaces,
            hotkey::set_hotkey,
            hotkey::set_shortcut,
        ])
        .run(tauri::generate_context!())
        .expect("error while running ION Screen Capture");
}
