//! Managed application state (`tauri::State<AppState>`).

use tokio::sync::Mutex;

use crate::discovery::DiscoveryHandle;
use crate::instrument::idn::{Class, Idn, Vendor};
use crate::instrument::ScreenCapture;
use crate::transport::Transport;

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
    /// Original bytes of the last capture, retained so the UI can copy/save it
    /// on demand (right-click) without re-triggering the instrument.
    pub last_capture: Mutex<Option<Vec<u8>>>,
}
