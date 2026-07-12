//! Backend → frontend event names and shared payload/response DTOs.

use serde::Serialize;

use crate::discovery::DiscoverySource;
use crate::instrument::idn::{Class, Idn, Vendor};
use crate::instrument::ImageFormat;

// --- connection / capture ---
pub const CONNECTION_CHANGED: &str = "connection:changed";
pub const CAPTURE_DONE: &str = "capture:done";
pub const CAPTURE_ERROR: &str = "capture:error";

// --- discovery ---
pub const DISCOVERY_STARTED: &str = "discovery:started";
pub const DISCOVERY_DEVICE: &str = "discovery:device";
pub const DISCOVERY_PROGRESS: &str = "discovery:progress";
pub const DISCOVERY_SOURCE_DONE: &str = "discovery:source-done";
pub const DISCOVERY_ERROR: &str = "discovery:error";
pub const DISCOVERY_COMPLETE: &str = "discovery:complete";

/// Identity + capture capabilities of the connected instrument. Returned by
/// `connect` / `connection_status` and emitted on `connection:changed`.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionInfo {
    pub addr: String,
    pub vendor: Vendor,
    pub class: Class,
    pub idn: Idn,
    pub supported_formats: Vec<ImageFormat>,
    pub supports_color: bool,
    pub supports_invert: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Progress {
    pub scanned: usize,
    pub total: usize,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceDoneEvt {
    pub source: DiscoverySource,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceErrorEvt {
    pub source: DiscoverySource,
    pub message: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Complete {
    pub total_found: usize,
}
