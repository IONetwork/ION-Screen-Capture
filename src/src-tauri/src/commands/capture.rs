//! Screen capture command + shared capture routine (also used by the hotkey).
//!
//! Two paths through here.
//!
//! **Normal capture**: grab the bytes, save and copy them, hand back a preview.
//! Unchanged from before "Reduced Color" existed.
//!
//! **Reduced capture**: the reducer is JavaScript and can only run in the
//! webview, so `perform_capture` grabs the bytes, hands back a preview, and
//! parks everything the delivery will need in `AppState.pending`. It does *not*
//! save or copy, because those would persist the unreduced image. The frontend
//! then either:
//!
//! * reduces the pixels and calls `finalize_reduced_capture`, or
//! * fails, times out, and calls `abandon_reduction`.
//!
//! Both end in `deliver`, so a capture is never silently dropped: if reduction
//! cannot happen the user still gets their file, plus a reason.

use base64::Engine;
use tauri::{AppHandle, Manager};

use crate::error::{AppError, AppResult};
use crate::image_out::encode_indexed_png;
use crate::instrument::{CaptureOptions, ImageFormat};
use crate::state::{AppState, PendingReduction};

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
    /// Desired fetch format; falls back to a supported one if omitted/unsupported.
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
    /// "Reduced Color": defer the save and the clipboard copy so they get the
    /// reduced image rather than the instrument's.
    #[serde(default)]
    pub reduce: bool,
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
    /// The webview still owes a reduction. Nothing has been saved or copied yet;
    /// pair `capture_token` with `finalize_reduced_capture` or `abandon_reduction`.
    pub pending_reduction: bool,
    pub capture_token: Option<u32>,
    /// These bytes are the reduction, not the instrument's own.
    pub reduced: bool,
    /// Set when reduction was asked for but could not be delivered. The file was
    /// still written, from the original bytes.
    pub reduce_error: Option<String>,
}

impl CaptureResponse {
    fn new(format: ImageFormat, bytes_len: usize, data_url: String) -> Self {
        Self {
            format,
            width: None,
            height: None,
            bytes_len,
            data_url,
            saved_path: None,
            copied_to_clipboard: false,
            pending_reduction: false,
            capture_token: None,
            reduced: false,
            reduce_error: None,
        }
    }
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

    // Retain the bytes so the UI can copy/save this capture on demand
    // (right-click) without re-triggering the instrument.
    store_last_capture(app, raw.bytes.clone()).await;

    let data_url = preview_data_url(raw.format, &raw.bytes);
    let stamp = capture_stamp();

    if req.reduce {
        // Dimensions from the image header rather than the driver, which reports
        // them only optionally, and rather than a full decode, which would cost
        // megabytes for two numbers.
        let (width, height) = image_dimensions(&raw.bytes).ok_or_else(|| {
            AppError::Image("could not read the capture's dimensions for reduction".into())
        })?;

        let token = state
            .next_token
            .fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        {
            let mut pending = state.pending.lock().await;
            *pending = Some(PendingReduction {
                token,
                original: raw.bytes.clone(),
                original_format: raw.format,
                width,
                height,
                save_dir: req.save_dir.clone(),
                copy_to_clipboard: req.copy_to_clipboard,
                stamp,
            });
        }

        let mut resp = CaptureResponse::new(raw.format, raw.bytes.len(), data_url);
        resp.width = Some(width);
        resp.height = Some(height);
        resp.pending_reduction = true;
        resp.capture_token = Some(token);
        return Ok(resp);
    }

    let saved_path =
        save_if_requested(req.save_dir.as_deref(), &raw.bytes, raw.format, &stamp).await?;
    let copied_to_clipboard = if req.copy_to_clipboard {
        copy_image_to_clipboard(app, &raw.bytes).unwrap_or(false)
    } else {
        false
    };

    let mut resp = CaptureResponse::new(raw.format, raw.bytes.len(), data_url);
    resp.width = raw.width;
    resp.height = raw.height;
    resp.saved_path = saved_path;
    resp.copied_to_clipboard = copied_to_clipboard;
    Ok(resp)
}

/// Finish a reduced capture.
///
/// The payload is a raw IPC body, `[token: u32 LE][indices][palette]`, with no
/// metadata: the dimensions and delivery settings come from the pending slot.
/// Raw matters here. Tauri only skips JSON encoding when the byte buffer is the
/// *entire* argument, and a nested `Uint8Array` becomes a JSON number array
/// instead: measured on a 1024x600 screen, 2.6 MB and hundreds of milliseconds
/// against 749 KB and under a millisecond.
#[tauri::command]
pub async fn finalize_reduced_capture(
    app: AppHandle,
    request: tauri::ipc::Request<'_>,
) -> AppResult<CaptureResponse> {
    let tauri::ipc::InvokeBody::Raw(body) = request.body() else {
        return Err(AppError::Protocol(
            "finalize_reduced_capture needs a raw IPC body".into(),
        ));
    };
    if body.len() < 4 {
        return Err(AppError::Protocol("truncated reduction payload".into()));
    }
    let token = u32::from_le_bytes([body[0], body[1], body[2], body[3]]);
    let payload = &body[4..];

    let pending = take_pending(&app, token).await?;

    let (indices, palette) = split_reduction_payload(payload, pending.width, pending.height)?;

    // Always an indexed PNG, whatever the instrument was asked for. The other
    // formats have no palette, so writing the reduction into one of them would
    // change how the image looks without shrinking the file, and usually make it
    // larger than the original. The UI says so when the switch is turned on.
    let bytes = encode_indexed_png(indices, palette, pending.width, pending.height)?;

    deliver(&app, bytes, ImageFormat::Png, &pending, true, None).await
}

/// Deliver the unreduced capture because the webview could not reduce it.
///
/// This exists so a failed reduction cannot silently swallow an auto-save. The
/// frontend calls it from its catch and its timeout.
#[tauri::command]
pub async fn abandon_reduction(
    app: AppHandle,
    token: u32,
    reason: String,
) -> AppResult<CaptureResponse> {
    let pending = take_pending(&app, token).await?;
    let bytes = pending.original.clone();
    let format = pending.original_format;
    deliver(&app, bytes, format, &pending, false, Some(reason)).await
}

/// Take the pending slot, rejecting a stale or duplicate token.
async fn take_pending(app: &AppHandle, token: u32) -> AppResult<PendingReduction> {
    let state = app.state::<AppState>();
    let mut guard = state.pending.lock().await;
    match guard.as_ref() {
        // Superseded by a newer capture, or already delivered.
        Some(p) if p.token == token => Ok(guard.take().expect("just matched")),
        _ => Err(AppError::NoCapture),
    }
}

/// Shared tail: install `bytes` as the current capture, then run the save and
/// clipboard copy that `perform_capture` deferred.
async fn deliver(
    app: &AppHandle,
    bytes: Vec<u8>,
    format: ImageFormat,
    pending: &PendingReduction,
    reduced: bool,
    reduce_error: Option<String>,
) -> AppResult<CaptureResponse> {
    let data_url = preview_data_url(format, &bytes);
    let bytes_len = bytes.len();
    store_last_capture(app, bytes.clone()).await;

    let saved_path = save_if_requested(
        pending.save_dir.as_deref(),
        &bytes,
        format,
        &pending.stamp,
    )
    .await?;

    let copied_to_clipboard = if pending.copy_to_clipboard {
        copy_image_to_clipboard(app, &bytes).unwrap_or(false)
    } else {
        false
    };

    let mut resp = CaptureResponse::new(format, bytes_len, data_url);
    resp.width = Some(pending.width);
    resp.height = Some(pending.height);
    resp.saved_path = saved_path;
    resp.copied_to_clipboard = copied_to_clipboard;
    resp.reduced = reduced;
    resp.reduce_error = reduce_error;
    Ok(resp)
}

/// Split a finalize payload into its index plane and its palette.
///
/// The payload carries no metadata, so the boundary is derived from the pending
/// capture's dimensions. Worth isolating and testing: an off-by-one here would
/// not fail loudly, it would shift the palette by a byte and recolour the whole
/// image.
fn split_reduction_payload<'a>(
    payload: &'a [u8],
    width: u32,
    height: u32,
) -> AppResult<(&'a [u8], &'a [u8])> {
    let px = (width as usize)
        .checked_mul(height as usize)
        .ok_or_else(|| AppError::Image(format!("size {width}x{height} overflows")))?;
    if payload.len() <= px || (payload.len() - px) % 3 != 0 {
        return Err(AppError::Image(format!(
            "reduction payload is {} bytes; expected {px} indices plus a non-empty multiple of 3 for the palette",
            payload.len()
        )));
    }
    Ok(payload.split_at(px))
}

/// Read just the header for the image's dimensions. Cheaper than a decode by
/// several megabytes, and exact, unlike the drivers' optional reporting.
fn image_dimensions(bytes: &[u8]) -> Option<(u32, u32)> {
    image::ImageReader::new(std::io::Cursor::new(bytes))
        .with_guessed_format()
        .ok()?
        .into_dimensions()
        .ok()
}

async fn store_last_capture(app: &AppHandle, bytes: Vec<u8>) {
    let state = app.state::<AppState>();
    let mut last = state.last_capture.lock().await;
    *last = Some(bytes);
}

async fn save_if_requested(
    save_dir: Option<&str>,
    bytes: &[u8],
    format: ImageFormat,
    stamp: &str,
) -> AppResult<Option<String>> {
    match save_dir.filter(|d| !d.is_empty()) {
        Some(dir) => {
            let path = build_save_path(dir, format, stamp);
            tokio::fs::write(&path, bytes)
                .await
                .map_err(|e| AppError::Fs(format!("writing {path}: {e}")))?;
            Ok(Some(path))
        }
        None => Ok(None),
    }
}

/// Decode the captured image and write it to the system clipboard as a bitmap.
fn copy_image_to_clipboard(app: &AppHandle, bytes: &[u8]) -> AppResult<bool> {
    let decoded = image::load_from_memory(bytes)
        .map_err(|e| AppError::Protocol(format!("decode image for clipboard: {e}")))?;
    let rgba = decoded.to_rgba8();
    let (w, h) = rgba.dimensions();
    write_clipboard_rgba(app, &rgba.into_raw(), w, h)
}

fn write_clipboard_rgba(app: &AppHandle, rgba: &[u8], w: u32, h: u32) -> AppResult<bool> {
    use tauri_plugin_clipboard_manager::ClipboardExt;
    let image = tauri::image::Image::new(rgba, w, h);
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
/// retained bytes are written verbatim, which is correct for their format -
/// including a reduced capture, where they are already the indexed PNG.
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
fn capture_stamp() -> String {
    chrono::Local::now().format("%Y%m%d-%H%M%S").to_string()
}

fn build_save_path(dir: &str, format: ImageFormat, stamp: &str) -> String {
    let sep = if dir.ends_with('/') || dir.ends_with('\\') {
        ""
    } else {
        "/"
    };
    format!("{dir}{sep}capture_{stamp}.{ext}", ext = format.ext())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn splits_a_well_formed_payload() {
        // 2x2 image, 3 palette entries
        let mut body = vec![0u8, 1, 2, 1];
        body.extend_from_slice(&[10, 11, 12, 20, 21, 22, 30, 31, 32]);
        let (indices, palette) = split_reduction_payload(&body, 2, 2).expect("split");
        assert_eq!(indices, &[0, 1, 2, 1]);
        assert_eq!(palette.len(), 9);
        assert_eq!(&palette[..3], &[10, 11, 12]);
    }

    #[test]
    fn rejects_a_malformed_payload() {
        let px4 = vec![0u8; 4];
        // no palette at all
        assert!(split_reduction_payload(&px4, 2, 2).is_err());
        // palette not a multiple of 3
        let mut short = px4.clone();
        short.extend_from_slice(&[1, 2]);
        assert!(split_reduction_payload(&short, 2, 2).is_err());
        // fewer indices than pixels
        let mut wrong = vec![0u8; 3];
        wrong.extend_from_slice(&[1, 2, 3]);
        assert!(split_reduction_payload(&wrong, 2, 2).is_err());
    }

    #[test]
    fn save_path_uses_the_captures_stamp_and_the_written_format() {
        // A reduced capture is written as PNG even when fetched as BMP, so the
        // extension must follow the format the bytes actually are.
        let p = build_save_path("C:/shots", ImageFormat::Png, "20260907-120000");
        assert_eq!(p, "C:/shots/capture_20260907-120000.png");
        // trailing separator is not doubled
        let p = build_save_path("C:/shots/", ImageFormat::Bmp24, "20260907-120000");
        assert_eq!(p, "C:/shots/capture_20260907-120000.bmp");
    }
}
