//! Managed application state (`tauri::State<AppState>`).

use tokio::sync::Mutex;

use crate::discovery::DiscoveryHandle;
use crate::instrument::idn::{Class, Idn, Vendor};
use crate::instrument::{ImageFormat, ScreenCapture};
use crate::transport::Transport;

/// A capture whose reduction the webview still owes us.
///
/// Everything the deferred save and clipboard copy will need lives here rather
/// than being re-sent by the frontend. Three reasons:
///
/// * If the reduction fails, `abandon_reduction` can still deliver the original.
///   Without this, a JS exception would silently skip an auto-save the user had
///   switched on, and the UI would look like a normal successful capture.
/// * Settings cannot drift between capture and finalize, and finalize cannot be
///   pointed at a different directory than the capture asked for.
/// * It frees the finalize payload to be a bare byte buffer, which is what lets
///   it cross the IPC boundary as a raw body instead of a JSON number array.
pub struct PendingReduction {
    /// Monotonic id, so a stale finalize cannot land on a newer capture (a
    /// second hotkey press while the first reduction is still in flight).
    pub token: u32,
    /// The instrument's own bytes: the fallback if reduction cannot be delivered.
    pub original: Vec<u8>,
    pub original_format: ImageFormat,
    /// Read from the image header at capture time. The SCPI drivers report
    /// dimensions only optionally, and the finalize payload carries no metadata,
    /// so these are what the index count gets validated against.
    pub width: u32,
    pub height: u32,
    /// Delivery that `perform_capture` deferred, replayed on finalize or abandon.
    pub save_dir: Option<String>,
    pub copy_to_clipboard: bool,
    /// Frozen at capture time so the filename reflects when the screen was
    /// grabbed, not when the reduction happened to finish.
    pub stamp: String,
}

/// An active instrument connection: the socket transport plus the screen-capture
/// driver selected from its `*IDN?`.
pub struct Connection {
    pub transport: Transport,
    pub screen: Box<dyn ScreenCapture>,
    pub vendor: Vendor,
    pub class: Class,
    pub idn: Idn,
    pub addr: std::net::SocketAddr,
}

#[derive(Default)]
pub struct AppState {
    /// `tokio::sync::Mutex` because the guard is held across `.await` (socket
    /// I/O); it also serializes captures on the single connection.
    pub conn: Mutex<Option<Connection>>,
    /// Currently-running discovery scan, if any.
    pub discovery: Mutex<Option<DiscoveryHandle>>,
    /// The last capture, retained so the UI can copy/save it on demand
    /// (right-click) without re-triggering the instrument. Holds the reduced
    /// bytes once a reduced capture has been finalized, so right-click Save and
    /// Copy always match what the preview shows. The format that goes with these
    /// bytes travels in the `CaptureResponse` the frontend holds, which is what
    /// it derives a save-as extension from.
    pub last_capture: Mutex<Option<Vec<u8>>>,
    /// A capture awaiting reduction by the webview, if any. Taking this slot is
    /// the whole idempotency guard: whoever takes it first wins, and a second
    /// finalize or abandon for the same capture gets `NoCapture`.
    pub pending: Mutex<Option<PendingReduction>>,
    /// Source of `PendingReduction::token`.
    pub next_token: std::sync::atomic::AtomicU32,
}
