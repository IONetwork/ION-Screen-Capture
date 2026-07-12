//! Screen capture command + shared capture routine (also used by the hotkey).

use base64::Engine;
use tauri::{AppHandle, Manager};

use crate::error::{AppError, AppResult};
use crate::instrument::{CaptureOptions, ImageFormat};
use crate::state::AppState;

fn default_true() -> bool {
    true
}

/// Whether to return the instrument to LOCAL after a capture / on disconnect -
/// the "Unlock after capture" setting (default off), read from settings.json.
pub(crate) fn unlock_after_capture(app: &AppHandle) -> bool {
    use tauri_plugin_store::StoreExt;
    app.store("settings.json")
        .ok()
        .and_then(|s| s.get("unlockAfterCapture"))
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureRequest {
    /// Desired format; falls back to a supported one if omitted/unsupported.
    #[serde(default)]
    pub format: Option<ImageFormat>,
    #[serde(default = "default_true")]
    pub color: bool,
    #[serde(default)]
    pub invert: bool,
    #[serde(default)]
    pub save_dir: Option<String>,
    #[serde(default)]
    pub copy_to_clipboard: bool,
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureResponse {
    pub format: ImageFormat,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub bytes_len: usize,
    /// `data:<mime>;base64,…` for an immediate `<img>` preview.
    pub data_url: String,
    pub saved_path: Option<String>,
    pub copied_to_clipboard: bool,
}

/// Capture the connected instrument's screen, optionally saving to disk and/or
/// copying to the clipboard. Shared by the `capture` command and the hotkey.
pub async fn perform_capture(app: &AppHandle, req: CaptureRequest) -> AppResult<CaptureResponse> {
    let state = app.state::<AppState>();

    let raw = {
        let mut guard = state.conn.lock().await;
        let conn = guard.as_mut().ok_or(AppError::NotConnected)?;
        let formats = conn.screen.supported_formats();
        let format = req
            .format
            .filter(|f| formats.contains(f))
            .or_else(|| {
                if formats.contains(&ImageFormat::Png) {
                    Some(ImageFormat::Png)
                } else {
                    formats.first().copied()
                }
            })
            .ok_or_else(|| AppError::Unsupported {
                vendor: format!("{:?}", conn.vendor),
                what: "any image format".into(),
            })?;
        let opts = CaptureOptions {
            format,
            color: req.color,
            invert: req.invert,
        };
        let raw = conn.screen.capture(&mut conn.transport, &opts).await?;
        // Optionally hand the instrument back to LOCAL (front panel usable),
        // gated by the "Unlock after capture" setting (default off). Best-effort -
        // never turns a successful capture into a failure. Most instruments have
        // a raw-socket command; Truevolt DMMs need the VXI-11 device_local RPC.
        if unlock_after_capture(app) {
            let _ = conn.screen.go_local(&mut conn.transport).await;
            if conn.screen.wants_vxi11_local() {
                let _ = crate::discovery::vxi11::device_local(conn.addr.ip()).await;
            }
        }
        raw
    };

    // Retain the original bytes so the UI can copy/save this capture on demand
    // (right-click) without re-triggering the instrument.
    {
        let mut last = state.last_capture.lock().await;
        *last = Some(raw.bytes.clone());
    }

    let saved_path = match req.save_dir.as_deref().filter(|d| !d.is_empty()) {
        Some(dir) => {
            let path = build_save_path(dir, raw.format);
            tokio::fs::write(&path, &raw.bytes)
                .await
                .map_err(|e| AppError::Fs(format!("writing {path}: {e}")))?;
            Some(path)
        }
        None => None,
    };

    let copied_to_clipboard = if req.copy_to_clipboard {
        copy_image_to_clipboard(app, &raw.bytes).unwrap_or(false)
    } else {
        false
    };

    let data_url = preview_data_url(raw.format, &raw.bytes);

    Ok(CaptureResponse {
        format: raw.format,
        width: raw.width,
        height: raw.height,
        bytes_len: raw.bytes.len(),
        data_url,
        saved_path,
        copied_to_clipboard,
    })
}

/// Decode the captured image and write it to the system clipboard as a bitmap.
fn copy_image_to_clipboard(app: &AppHandle, bytes: &[u8]) -> AppResult<bool> {
    use tauri_plugin_clipboard_manager::ClipboardExt;
    let decoded = image::load_from_memory(bytes)
        .map_err(|e| AppError::Protocol(format!("decode image for clipboard: {e}")))?;
    let rgba = decoded.to_rgba8();
    let (w, h) = rgba.dimensions();
    let buf = rgba.into_raw();
    let image = tauri::image::Image::new(&buf, w, h);
    app.clipboard()
        .write_image(&image)
        .map_err(|e| AppError::Protocol(format!("clipboard write: {e}")))?;
    Ok(true)
}

/// Build a `data:` URL the webview can render. TIFF isn't displayable in an
/// `<img>`, so transcode it to PNG for the preview only - the saved file and
/// clipboard still use the original captured bytes.
fn preview_data_url(format: ImageFormat, bytes: &[u8]) -> String {
    use base64::engine::general_purpose::STANDARD;
    if matches!(format, ImageFormat::Tiff) {
        if let Ok(png) = transcode_to_png(bytes) {
            return format!("data:image/png;base64,{}", STANDARD.encode(&png));
        }
    }
    format!("data:{};base64,{}", format.mime(), STANDARD.encode(bytes))
}

fn transcode_to_png(bytes: &[u8]) -> Result<Vec<u8>, image::ImageError> {
    let img = image::load_from_memory(bytes)?;
    let mut out = std::io::Cursor::new(Vec::new());
    img.write_to(&mut out, image::ImageFormat::Png)?;
    Ok(out.into_inner())
}

#[tauri::command]
pub async fn capture(app: AppHandle, req: CaptureRequest) -> AppResult<CaptureResponse> {
    perform_capture(&app, req).await
}

/// Copy the most recent capture to the system clipboard (UI right-click action).
#[tauri::command]
pub async fn copy_last_capture(app: AppHandle) -> AppResult<()> {
    let state = app.state::<AppState>();
    let bytes = {
        let guard = state.last_capture.lock().await;
        guard.clone()
    }
    .ok_or(AppError::NoCapture)?;
    copy_image_to_clipboard(&app, &bytes)?;
    Ok(())
}

/// Write the most recent capture to `path` (UI "Save image as…" action). The
/// original captured bytes are written verbatim - correct for the chosen format.
#[tauri::command]
pub async fn save_last_capture(app: AppHandle, path: String) -> AppResult<String> {
    let state = app.state::<AppState>();
    let bytes = {
        let guard = state.last_capture.lock().await;
        guard.clone()
    }
    .ok_or(AppError::NoCapture)?;
    tokio::fs::write(&path, &bytes)
        .await
        .map_err(|e| AppError::Fs(format!("writing {path}: {e}")))?;
    Ok(path)
}

/// Locale-independent, filename-safe timestamp (fixes the legacy de-DE format).
fn build_save_path(dir: &str, format: ImageFormat) -> String {
    let ts = chrono::Local::now().format("%Y%m%d-%H%M%S");
    let sep = if dir.ends_with('/') || dir.ends_with('\\') {
        ""
    } else {
        "/"
    };
    format!("{dir}{sep}capture_{ts}.{ext}", ext = format.ext())
}
