//! Oscilloscope screen-capture drivers.

pub mod keysight;
pub mod rigol;
pub mod siglent;
pub mod tektronix;

use crate::error::{AppError, AppResult};
use crate::instrument::idn::Vendor;
use crate::instrument::ScreenCapture;

/// Build the screen-capture driver for a scope vendor.
pub fn make_scope(vendor: Vendor) -> AppResult<Box<dyn ScreenCapture>> {
    Ok(match vendor {
        Vendor::Rigol => Box::new(rigol::Rigol),
        Vendor::Keysight => Box::new(keysight::Keysight),
        Vendor::Siglent => Box::new(siglent::Siglent),
        Vendor::Tektronix => Box::new(tektronix::Tektronix),
        Vendor::Unknown => {
            return Err(AppError::Unsupported {
                vendor: "unknown".into(),
                what: "oscilloscope screen capture".into(),
            })
        }
    })
}
