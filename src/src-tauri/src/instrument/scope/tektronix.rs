//! Tektronix 4/5/6 Series oscilloscope screen capture.
//!
//! Save the screen to the scope's internal disk, wait for completion, read the
//! file back over the socket (a bare PNG with no length header), then delete it.
//! Requires `SOCKETServer:PROTOCol NONe` (the default on 4/5/6 Series).
//! (The older MSO/DPO4000 family — set FILEFormat + USB path — is a future add.)

use async_trait::async_trait;

use crate::error::AppResult;
use crate::instrument::{CaptureOptions, ImageFormat, RawCapture, ScreenCapture};
use crate::transport::ScpiIo;

pub struct Tektronix;

const FORMATS: &[ImageFormat] = &[ImageFormat::Png];
const REMOTE: &str = "\"C:/Temp/ion_capture.png\"";

#[async_trait]
impl ScreenCapture for Tektronix {
    fn supported_formats(&self) -> &'static [ImageFormat] {
        FORMATS
    }

    async fn capture(&self, io: &mut dyn ScpiIo, _opts: &CaptureOptions) -> AppResult<RawCapture> {
        io.write_line(&format!("SAVe:IMAGe {REMOTE}")).await?;
        let _ = io.query("*OPC?").await?; // block until the file is written
        io.write_line(&format!("FILESystem:READFile {REMOTE}")).await?;
        let bytes = io.read_stream_idle(500, crate::instrument::MAX_IMAGE_BYTES).await?;
        let bytes = crate::instrument::truncate_at_png_iend(bytes);
        // Best-effort cleanup of the temp file on the scope.
        let _ = io.write_line(&format!("FILESystem:DELEte {REMOTE}")).await;
        Ok(RawCapture {
            bytes,
            format: ImageFormat::Png,
            width: None,
            height: None,
        })
    }
}
