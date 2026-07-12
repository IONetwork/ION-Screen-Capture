//! Screen-capture capability, shared types, and the driver factory.
//!
//! The app's sole function is capturing an instrument's **screen**. Any
//! instrument (scope, DMM, analyzer, supply, …) that exposes a screenshot over
//! SCPI is supported through a per-family `ScreenCapture` driver; instruments
//! that can't produce a screenshot are not supported.

pub mod dmm;
pub mod idn;
pub mod scope;

use async_trait::async_trait;
use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};
use crate::transport::ScpiIo;
use idn::{Class, Vendor};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "UPPERCASE")]
pub enum ImageFormat {
    Png,
    Bmp24,
    Bmp8,
    Jpeg,
    Tiff,
}

impl ImageFormat {
    pub fn mime(self) -> &'static str {
        match self {
            ImageFormat::Png => "image/png",
            ImageFormat::Bmp24 | ImageFormat::Bmp8 => "image/bmp",
            ImageFormat::Jpeg => "image/jpeg",
            ImageFormat::Tiff => "image/tiff",
        }
    }
    pub fn ext(self) -> &'static str {
        match self {
            ImageFormat::Png => "png",
            ImageFormat::Bmp24 | ImageFormat::Bmp8 => "bmp",
            ImageFormat::Jpeg => "jpeg",
            ImageFormat::Tiff => "tiff",
        }
    }
}

/// Protocol-level capture knobs. Post-capture side effects (save/clipboard)
/// live in the command layer. `color`/`invert` are honored only by families
/// that expose them (e.g. Rigol/Keysight scopes); others ignore them.
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureOptions {
    pub format: ImageFormat,
    pub color: bool,
    pub invert: bool,
}

#[derive(Clone, Debug)]
pub struct RawCapture {
    pub bytes: Vec<u8>,
    pub format: ImageFormat,
    pub width: Option<u32>,
    pub height: Option<u32>,
}

/// Screen-capture capability. Each driver owns its *whole* wire conversation
/// (e.g. Tektronix's save/OPC/read-file/delete sequence fits behind `capture`).
#[async_trait]
pub trait ScreenCapture: Send + Sync {
    fn supported_formats(&self) -> &'static [ImageFormat];
    fn supports_color(&self) -> bool {
        false
    }
    fn supports_invert(&self) -> bool {
        false
    }
    /// One-time setup after connect (default: nothing).
    async fn on_connect(&self, _io: &mut dyn ScpiIo) -> AppResult<()> {
        Ok(())
    }
    /// Return the instrument to LOCAL (front panel usable) over the raw socket.
    /// Default no-op; drivers with a real command override. Best-effort - the
    /// caller ignores the result so it never fails a capture/disconnect.
    async fn go_local(&self, _io: &mut dyn ScpiIo) -> AppResult<()> {
        Ok(())
    }
    /// True if the instrument only returns to LOCAL via the VXI-11 `device_local`
    /// RPC (no raw-socket command exists - Keysight/Rigol-DM858 Truevolt DMMs).
    /// The command layer then also fires `discovery::vxi11::device_local`.
    fn wants_vxi11_local(&self) -> bool {
        false
    }
    async fn capture(&self, io: &mut dyn ScpiIo, opts: &CaptureOptions) -> AppResult<RawCapture>;
}

/// Build the screen-capture driver for a detected instrument, or error if we
/// don't support capturing its screen. `class` selects the dialect family;
/// each family maps vendors/models to their screenshot SCPI.
pub fn make_screen(vendor: Vendor, class: Class, model: &str) -> AppResult<Box<dyn ScreenCapture>> {
    match class {
        Class::Oscilloscope => scope::make_scope(vendor),
        Class::Dmm => dmm::make_dmm(vendor, model),
        Class::Other => Err(AppError::Unsupported {
            vendor: format!("{vendor:?}"),
            what: "screen capture for this instrument".into(),
        }),
    }
}

// --- shared image helpers for bare-stream drivers ---

/// Max bytes to accept for a bare-stream screenshot (headroom over ~2.5 MB).
pub(crate) const MAX_IMAGE_BYTES: usize = 16 * 1024 * 1024;

/// Truncate a Windows BMP to the size in its header (offset 2, u32 LE) - strips
/// the 1–13 junk trailing bytes some Siglent firmware appends after `SCDP`.
pub(crate) fn truncate_bmp(bytes: Vec<u8>) -> Vec<u8> {
    if bytes.len() >= 6 && &bytes[0..2] == b"BM" {
        let size = u32::from_le_bytes([bytes[2], bytes[3], bytes[4], bytes[5]]) as usize;
        if (54..=bytes.len()).contains(&size) {
            return bytes[..size].to_vec();
        }
    }
    bytes
}

/// Truncate at the PNG `IEND` chunk end - strips any trailing bytes after a PNG
/// streamed with no length header (Tektronix `FILESystem:READFile`).
pub(crate) fn truncate_at_png_iend(bytes: Vec<u8>) -> Vec<u8> {
    const IEND: [u8; 8] = [0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82];
    if let Some(pos) = bytes.windows(8).position(|w| w == IEND) {
        return bytes[..pos + 8].to_vec();
    }
    bytes
}
