//! Discovery commands: start / cancel a scan, list interfaces.

use tauri::{AppHandle, State};

use crate::discovery::{spawn_discovery, DiscoveryOptions};
use crate::error::AppResult;
use crate::state::AppState;

#[tauri::command]
pub async fn start_discovery(
    app: AppHandle,
    state: State<'_, AppState>,
    opts: Option<DiscoveryOptions>,
) -> AppResult<()> {
    let opts = opts.unwrap_or_default();
    let mut guard = state.discovery.lock().await;
    // Idempotent-by-replace: cancel any running scan first.
    if let Some(existing) = guard.take() {
        existing.cancel.cancel();
    }
    *guard = Some(spawn_discovery(app, opts));
    Ok(())
}

#[tauri::command]
pub async fn cancel_discovery(state: State<'_, AppState>) -> AppResult<()> {
    let mut guard = state.discovery.lock().await;
    if let Some(handle) = guard.take() {
        handle.cancel.cancel();
    }
    Ok(())
}

#[tauri::command]
pub fn list_interfaces() -> AppResult<Vec<String>> {
    let mut out = Vec::new();
    for iface in if_addrs::get_if_addrs()? {
        if iface.is_loopback() {
            continue;
        }
        if let if_addrs::IfAddr::V4(v4) = iface.addr {
            if v4.ip.is_private() {
                out.push(format!("{} ({})", iface.name, v4.ip));
            }
        }
    }
    Ok(out)
}
