//! Configurable global capture hotkey. Fires a capture using the persisted
//! save/clipboard settings and emits `capture:done` / `capture:error`.
//! The binding is a `{code, ctrl, alt, shift, meta}` spec persisted by the
//! frontend in `settings.json`; the default is Ctrl+PrintScreen.

use std::str::FromStr;

use tauri::{AppHandle, Emitter};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

use crate::commands::capture::{perform_capture, CaptureRequest};
use crate::error::{AppError, AppResult};
use crate::events;
use crate::instrument::ImageFormat;

/// A key binding sent from the UI. `code` is a W3C `KeyboardEvent.code`
/// (e.g. `PrintScreen`, `KeyS`, `F9`) — the same names `keyboard-types` parses.
#[derive(Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShortcutSpec {
    pub code: String,
    #[serde(default)]
    pub ctrl: bool,
    #[serde(default)]
    pub alt: bool,
    #[serde(default)]
    pub shift: bool,
    #[serde(default)]
    pub meta: bool,
}

fn default_spec() -> ShortcutSpec {
    ShortcutSpec {
        code: "PrintScreen".into(),
        ctrl: true,
        alt: false,
        shift: false,
        meta: false,
    }
}

/// Translate a spec into a plugin `Shortcut`, erroring on an unknown key code.
fn build_shortcut(spec: &ShortcutSpec) -> AppResult<Shortcut> {
    let mut mods = Modifiers::empty();
    if spec.ctrl {
        mods |= Modifiers::CONTROL;
    }
    if spec.alt {
        mods |= Modifiers::ALT;
    }
    if spec.shift {
        mods |= Modifiers::SHIFT;
    }
    if spec.meta {
        mods |= Modifiers::SUPER;
    }
    let code = Code::from_str(&spec.code)
        .map_err(|_| AppError::Protocol(format!("unknown key: {}", spec.code)))?;
    let mods = (!mods.is_empty()).then_some(mods);
    Ok(Shortcut::new(mods, code))
}

/// The binding persisted by the frontend, or the Ctrl+PrintScreen default.
fn stored_spec(app: &AppHandle) -> ShortcutSpec {
    use tauri_plugin_store::StoreExt;
    app.store("settings.json")
        .ok()
        .and_then(|s| s.get("hotkeyShortcut"))
        .and_then(|v| serde_json::from_value::<ShortcutSpec>(v).ok())
        .unwrap_or_else(default_spec)
}

fn hotkey_enabled(app: &AppHandle) -> bool {
    use tauri_plugin_store::StoreExt;
    app.store("settings.json")
        .ok()
        .and_then(|s| s.get("hotkeyEnabled"))
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
}

/// Register the shortcut and route its press to a capture.
fn register(app: &AppHandle, spec: &ShortcutSpec) -> AppResult<()> {
    let sc = build_shortcut(spec)?;
    app.global_shortcut()
        .on_shortcut(sc, |app, _shortcut, event| {
            if event.state == ShortcutState::Pressed {
                trigger(app.clone());
            }
        })
        .map_err(|e| AppError::Protocol(format!("register hotkey (already in use?): {e}")))
}

/// Arm or disarm the global capture hotkey using the persisted binding.
pub fn set_enabled(app: &AppHandle, enabled: bool) -> AppResult<()> {
    let _ = app.global_shortcut().unregister_all(); // clear any prior binding
    if enabled {
        register(app, &stored_spec(app))?;
    }
    Ok(())
}

fn trigger(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let req = request_from_settings(&app);
        match perform_capture(&app, req).await {
            Ok(resp) => {
                let _ = app.emit(events::CAPTURE_DONE, resp);
            }
            Err(e) => {
                let _ = app.emit(
                    events::CAPTURE_ERROR,
                    serde_json::json!({ "kind": e.kind(), "message": e.to_string() }),
                );
            }
        }
    });
}

/// Build a capture request from the persisted settings (default format + the
/// current save/clipboard preferences).
fn request_from_settings(app: &AppHandle) -> CaptureRequest {
    use tauri_plugin_store::StoreExt;
    let mut save_dir = None;
    let mut copy_to_clipboard = false;
    let mut format = None;
    let mut color = true;
    let mut invert = false;
    if let Ok(store) = app.store("settings.json") {
        if store.get("saveToDisk").and_then(|v| v.as_bool()).unwrap_or(false) {
            save_dir = store
                .get("saveDir")
                .and_then(|v| v.as_str().map(str::to_string));
        }
        copy_to_clipboard = store
            .get("copyToClipboard")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);
        // Same capture options the UI uses (persisted by the frontend). An
        // unsupported/absent format falls back inside `perform_capture`.
        format = store
            .get("format")
            .and_then(|v| serde_json::from_value::<ImageFormat>(v).ok());
        color = store.get("color").and_then(|v| v.as_bool()).unwrap_or(true);
        invert = store.get("invert").and_then(|v| v.as_bool()).unwrap_or(false);
    }
    CaptureRequest {
        format,
        color,
        invert,
        save_dir,
        copy_to_clipboard,
    }
}

#[tauri::command]
pub fn set_hotkey(app: AppHandle, enabled: bool) -> AppResult<()> {
    set_enabled(&app, enabled)
}

/// Change the key binding. Validated before it touches the current
/// registration, then re-armed with the new combo if the hotkey is enabled.
#[tauri::command]
pub fn set_shortcut(app: AppHandle, spec: ShortcutSpec) -> AppResult<()> {
    build_shortcut(&spec)?; // reject a bad code without disarming the old one
    let _ = app.global_shortcut().unregister_all();
    if hotkey_enabled(&app) {
        register(&app, &spec)?;
    }
    Ok(())
}
