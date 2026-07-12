//! Rigol oscilloscope screen capture (DS1000Z / MSO5000 / DHO…).
//!
//! `:DISP:DATA? <color ON|OFF>,<invert ON|OFF>,<format>` returns an
//! IEEE 488.2 definite-length block. Ported from the legacy C# `Rigol1000`.

use async_trait::async_trait;

use crate::error::AppResult;
use crate::instrument::{CaptureOptions, ImageFormat, RawCapture, ScreenCapture};
use crate::transport::ScpiIo;

pub struct Rigol;

const FORMATS: &[ImageFormat] = &[
    ImageFormat::Png,
    ImageFormat::Bmp24,
    ImageFormat::Bmp8,
    ImageFormat::Jpeg,
    ImageFormat::Tiff,
];

fn format_token(f: ImageFormat) -> &'static str {
    match f {
        ImageFormat::Png => "PNG",
        ImageFormat::Bmp24 => "BMP24",
        ImageFormat::Bmp8 => "BMP8",
        ImageFormat::Jpeg => "JPEG",
        ImageFormat::Tiff => "TIFF",
    }
}

#[async_trait]
impl ScreenCapture for Rigol {
    fn supported_formats(&self) -> &'static [ImageFormat] {
        FORMATS
    }
    fn supports_color(&self) -> bool {
        true
    }
    fn supports_invert(&self) -> bool {
        true
    }

    async fn capture(&self, io: &mut dyn ScpiIo, opts: &CaptureOptions) -> AppResult<RawCapture> {
        let cmd = format!(
            ":DISP:DATA? {},{},{}",
            if opts.color { "ON" } else { "OFF" },
            if opts.invert { "ON" } else { "OFF" },
            format_token(opts.format),
        );
        let bytes = io.query_block(&cmd).await?;
        Ok(RawCapture {
            bytes,
            format: opts.format,
            width: None,
            height: None,
        })
    }
}
