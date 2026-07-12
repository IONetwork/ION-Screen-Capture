//! Siglent SDS oscilloscope screen capture.
//!
//! `SCDP` (screen dump) returns a bare Windows BMP with no framing and 1–13
//! junk trailing bytes; we read until idle and truncate via the BMP size field.
//! (HD-generation `PRINt? <BMP|PNG>` is a future refinement.)

use async_trait::async_trait;

use crate::error::AppResult;
use crate::instrument::{CaptureOptions, ImageFormat, RawCapture, ScreenCapture};
use crate::transport::ScpiIo;

pub struct Siglent;

const FORMATS: &[ImageFormat] = &[ImageFormat::Bmp24];

#[async_trait]
impl ScreenCapture for Siglent {
    fn supported_formats(&self) -> &'static [ImageFormat] {
        FORMATS
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
