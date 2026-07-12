//! DMM screen-capture drivers (screendump - NOT measurement).
//!
//! DMMs with a display expose a screenshot over SCPI:
//! - Keysight Truevolt + Rigol DM858 → `HCOPy:SDUMp:DATA?` (IEEE 488.2 block, PNG/BMP).
//! - Rigol DM3068 → `:DISP:DATA?` (IEEE 488.2 block, BMP).
//! - Siglent SDM → `SCDP` (bare BMP, no framing - truncate via the BMP size field).

use async_trait::async_trait;

use crate::error::{AppError, AppResult};
use crate::instrument::idn::Vendor;
use crate::instrument::{CaptureOptions, ImageFormat, RawCapture, ScreenCapture};
use crate::transport::ScpiIo;

const PNG_BMP: &[ImageFormat] = &[ImageFormat::Png, ImageFormat::Bmp24];
const BMP_ONLY: &[ImageFormat] = &[ImageFormat::Bmp24];

pub fn make_dmm(vendor: Vendor, model: &str) -> AppResult<Box<dyn ScreenCapture>> {
    let m = model.to_ascii_uppercase();
    match vendor {
        // Truevolt-style screendump. (A 34460A lacking option -LAN has no socket
        // at all and simply won't be reached.)
        Vendor::Keysight => Ok(Box::new(TruevoltDump)),
        Vendor::Rigol if m.starts_with("DM858") => Ok(Box::new(TruevoltDump)),
        Vendor::Rigol if m.starts_with("DM306") => Ok(Box::new(RigolDispData)),
        Vendor::Siglent if m.starts_with("SDM") => Ok(Box::new(SiglentScdp)),
        other => Err(AppError::Unsupported {
            vendor: format!("{other:?}"),
            what: format!("DMM screen capture for model {model}"),
        }),
    }
}

/// Keysight Truevolt (34461A/65A/70A) + Rigol DM858/DM858E.
struct TruevoltDump;

#[async_trait]
impl ScreenCapture for TruevoltDump {
    fn supported_formats(&self) -> &'static [ImageFormat] {
        PNG_BMP
    }
    // No raw-socket local command exists on Truevolt DMMs (Keysight 34461A,
    // Rigol DM858); the command layer clears "Rmt" via VXI-11 device_local.
    fn wants_vxi11_local(&self) -> bool {
        true
    }
    async fn capture(&self, io: &mut dyn ScpiIo, opts: &CaptureOptions) -> AppResult<RawCapture> {
        let (token, format) = match opts.format {
            ImageFormat::Bmp24 | ImageFormat::Bmp8 => ("BMP", ImageFormat::Bmp24),
            _ => ("PNG", ImageFormat::Png),
        };
        io.write_line(&format!("HCOPy:SDUMp:DATA:FORMat {token}")).await?;
        let bytes = io.query_block("HCOPy:SDUMp:DATA?").await?;
        Ok(RawCapture {
            bytes,
            format,
            width: None,
            height: None,
        })
    }
}

/// Rigol DM3068 - `:DISP:DATA?` (no args) → BMP definite-length block.
struct RigolDispData;

#[async_trait]
impl ScreenCapture for RigolDispData {
    fn supported_formats(&self) -> &'static [ImageFormat] {
        BMP_ONLY
    }
    async fn go_local(&self, io: &mut dyn ScpiIo) -> AppResult<()> {
        io.write_line(":SYSTem:LOCal").await
    }
    async fn capture(&self, io: &mut dyn ScpiIo, _opts: &CaptureOptions) -> AppResult<RawCapture> {
        let bytes = io.query_block(":DISP:DATA?").await?;
        Ok(RawCapture {
            bytes,
            format: ImageFormat::Bmp24,
            width: None,
            height: None,
        })
    }
}

/// Siglent SDM - `SCDP` → bare BMP (no framing).
struct SiglentScdp;

#[async_trait]
impl ScreenCapture for SiglentScdp {
    fn supported_formats(&self) -> &'static [ImageFormat] {
        BMP_ONLY
    }
    async fn go_local(&self, io: &mut dyn ScpiIo) -> AppResult<()> {
        io.write_line(":SYSTem:REMote OFF").await
    }
    async fn capture(&self, io: &mut dyn ScpiIo, _opts: &CaptureOptions) -> AppResult<RawCapture> {
        io.write_line("SCDP").await?;
        let bytes = io.read_stream_idle(400, crate::instrument::MAX_IMAGE_BYTES).await?;
        Ok(RawCapture {
            bytes: crate::instrument::truncate_bmp(bytes),
            format: ImageFormat::Bmp24,
            width: None,
            height: None,
        })
    }
}
