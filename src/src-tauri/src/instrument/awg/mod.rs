//! Waveform-generator screen capture.
//!
//! Rigol arbitrary-waveform generators (DG800 Pro / DG900 Pro / DG1000Z) return
//! a screenshot via the `:HCOPy` subsystem rather than the scope's `:DISP:DATA?`:
//!   `:HCOPy:SDUMp:DATA:FORMat {BMP|PNG}`  set the returned image format
//!   `:HCOPy:SDUMp:DATA?`                  return an IEEE 488.2 definite-length block

use async_trait::async_trait;

use crate::error::{AppError, AppResult};
use crate::instrument::idn::Vendor;
use crate::instrument::{CaptureOptions, ImageFormat, RawCapture, ScreenCapture};
use crate::transport::ScpiIo;

/// Build the screen-capture driver for a waveform-generator vendor.
pub fn make_awg(vendor: Vendor) -> AppResult<Box<dyn ScreenCapture>> {
    match vendor {
        Vendor::Rigol => Ok(Box::new(RigolHcopy)),
        _ => Err(AppError::Unsupported {
            vendor: format!("{vendor:?}"),
            what: "waveform-generator screen capture".into(),
        }),
    }
}

/// Rigol `:HCOPy` screen dump. The subsystem offers only BMP and PNG, and has no
/// colour/invert knobs.
pub struct RigolHcopy;

const FORMATS: &[ImageFormat] = &[ImageFormat::Png, ImageFormat::Bmp24];

#[async_trait]
impl ScreenCapture for RigolHcopy {
    fn supported_formats(&self) -> &'static [ImageFormat] {
        FORMATS
    }

    async fn capture(&self, io: &mut dyn ScpiIo, opts: &CaptureOptions) -> AppResult<RawCapture> {
        // supported_formats() constrains opts.format to PNG | BMP24; anything
        // else falls back to PNG. Report the format we actually requested.
        let (token, format) = match opts.format {
            ImageFormat::Bmp24 => ("BMP", ImageFormat::Bmp24),
            _ => ("PNG", ImageFormat::Png),
        };
        io.write_line(&format!(":HCOPy:SDUMp:DATA:FORMat {token}"))
            .await?;
        let bytes = io.query_block(":HCOPy:SDUMp:DATA?").await?;
        Ok(RawCapture {
            bytes,
            format,
            width: None,
            height: None,
        })
    }
}
