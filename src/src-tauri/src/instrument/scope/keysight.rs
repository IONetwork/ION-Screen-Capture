//! Keysight/Agilent InfiniiVision oscilloscope screen capture.
//!
//! `:HARDcopy:INKSaver OFF` (INKSaver defaults ON → inverted white background),
//! then `:DISPlay:DATA? <format>,<palette>` → IEEE 488.2 definite-length block.
//! X-Series formats: PNG / BMP / BMP8bit; palettes: COLor / GRAYscale.

use async_trait::async_trait;

use crate::error::AppResult;
use crate::instrument::{CaptureOptions, ImageFormat, RawCapture, ScreenCapture};
use crate::transport::ScpiIo;

pub struct Keysight;

const FORMATS: &[ImageFormat] = &[ImageFormat::Png, ImageFormat::Bmp24, ImageFormat::Bmp8];

fn format_token(f: ImageFormat) -> &'static str {
    match f {
        ImageFormat::Bmp24 => "BMP",
        ImageFormat::Bmp8 => "BMP8bit",
        _ => "PNG",
    }
}

#[async_trait]
impl ScreenCapture for Keysight {
    fn supported_formats(&self) -> &'static [ImageFormat] {
        FORMATS
    }
    fn supports_color(&self) -> bool {
        true
    }
    fn supports_invert(&self) -> bool {
        true
    }
    async fn go_local(&self, io: &mut dyn ScpiIo) -> AppResult<()> {
        io.write_line(":SYSTem:LOCK OFF").await
    }

    async fn capture(&self, io: &mut dyn ScpiIo, opts: &CaptureOptions) -> AppResult<RawCapture> {
        // INKSaver ON = inverted (white-bg); OFF = normal. Map `invert` onto it.
        io.write_line(&format!(
            ":HARDcopy:INKSaver {}",
            if opts.invert { "ON" } else { "OFF" }
        ))
        .await?;
        let palette = if opts.color { "COLor" } else { "GRAYscale" };
        let bytes = io
            .query_block(&format!(":DISPlay:DATA? {},{}", format_token(opts.format), palette))
            .await?;
        // JPEG/TIFF aren't offered on the X-Series; anything not BMP maps to PNG.
        let format = match opts.format {
            ImageFormat::Bmp24 | ImageFormat::Bmp8 => opts.format,
            _ => ImageFormat::Png,
        };
        Ok(RawCapture {
            bytes,
            format,
            width: None,
            height: None,
        })
    }
}
