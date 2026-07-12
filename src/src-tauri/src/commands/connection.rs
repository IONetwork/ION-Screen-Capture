//! Connect / disconnect / status commands.

use std::net::SocketAddr;
use std::time::Duration;

use tauri::{AppHandle, Emitter, State};

use crate::error::{AppError, AppResult};
use crate::events::{self, ConnectionInfo};
use crate::instrument::idn::{detect_class, detect_vendor, parse_idn};
use crate::instrument::make_screen;
use crate::state::{AppState, Connection};
use crate::transport::{ScpiIo, Transport};

const CONNECT_TIMEOUT: Duration = Duration::from_millis(3000);
const IO_TIMEOUT: Duration = Duration::from_millis(15000);

async fn resolve_addr(host: &str, port: u16) -> AppResult<SocketAddr> {
    tokio::net::lookup_host((host, port))
        .await
        .map_err(|e| AppError::Protocol(format!("invalid address {host}:{port}: {e}")))?
        .next()
        .ok_or_else(|| AppError::Protocol(format!("could not resolve {host}:{port}")))
}

fn info_for(conn: &Connection) -> ConnectionInfo {
    ConnectionInfo {
        addr: conn.addr.to_string(),
        vendor: conn.vendor,
        class: conn.class,
        idn: conn.idn.clone(),
        supported_formats: conn.screen.supported_formats().to_vec(),
        supports_color: conn.screen.supports_color(),
        supports_invert: conn.screen.supports_invert(),
    }
}

#[tauri::command]
pub async fn connect(
    app: AppHandle,
    state: State<'_, AppState>,
    ip: String,
    port: Option<u16>,
) -> AppResult<ConnectionInfo> {
    // Connecting while already connected SWITCHES instruments. The current
    // connection stays in `guard` until the new one is fully established below,
    // so a failed switch leaves you on the existing instrument. Assigning the
    // new Connection then drops the old one, closing its socket - which releases
    // single-session gear (e.g. Rigol raw sockets) cleanly.
    let mut guard = state.conn.lock().await;

    // Discovered devices supply their port; manual connects default to 5025
    // (the IANA scpi-raw port). Rigol=5555 / Tektronix=4000 must be specified.
    let addr = resolve_addr(&ip, port.unwrap_or(5025)).await?;
    let mut transport = Transport::connect(addr, CONNECT_TIMEOUT, IO_TIMEOUT).await?;

    let idn_raw = transport.query("*IDN?").await?;
    let idn = parse_idn(&idn_raw)?;
    let vendor = detect_vendor(&idn);
    let class = detect_class(vendor, &idn);
    // Errors here mean the instrument's screen can't be captured -> not supported.
    let screen = make_screen(vendor, class, &idn.model)?;
    screen.on_connect(&mut transport).await?;

    let conn = Connection {
        transport,
        screen,
        vendor,
        class,
        idn,
        addr,
    };
    let info = info_for(&conn);
    *guard = Some(conn);
    drop(guard);

    // The previous instrument's retained capture is now stale (copy/save-last).
    *state.last_capture.lock().await = None;

    let _ = app.emit(events::CONNECTION_CHANGED, Some(info.clone()));
    Ok(info)
}

#[tauri::command]
pub async fn disconnect(app: AppHandle, state: State<'_, AppState>) -> AppResult<()> {
    {
        let mut guard = state.conn.lock().await;
        if let Some(conn) = guard.as_mut() {
            // Release the instrument to LOCAL before closing the socket, but only
            // if "Unlock after capture" is enabled. Best-effort.
            if crate::commands::capture::unlock_after_capture(&app) {
                let _ = conn.screen.go_local(&mut conn.transport).await;
                if conn.screen.wants_vxi11_local() {
                    let _ = crate::discovery::vxi11::device_local(conn.addr.ip()).await;
                }
            }
        }
        *guard = None;
    }
    let _ = app.emit(events::CONNECTION_CHANGED, Option::<ConnectionInfo>::None);
    Ok(())
}

#[tauri::command]
pub async fn connection_status(state: State<'_, AppState>) -> AppResult<Option<ConnectionInfo>> {
    let guard = state.conn.lock().await;
    Ok(guard.as_ref().map(info_for))
}
