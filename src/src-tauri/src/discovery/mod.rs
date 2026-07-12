//! Instrument discovery: three concurrent producers (mDNS browse, subnet
//! sweep, VXI-11 broadcast) feed one deduplicated, streaming result set. A
//! single consumer owns the dedup set and is the only event emitter, so device
//! events are ordered and duplicate-free with no shared lock.

pub mod mdns;
pub mod probe;
pub mod sweep;
pub mod vxi11;

use std::collections::HashMap;
use std::net::IpAddr;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::Emitter;
use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;

use crate::events;
use crate::instrument::idn::{Class, Idn, Vendor};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum DiscoverySource {
    Mdns,
    Sweep,
    Vxi11,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveredDevice {
    pub ip: IpAddr,
    pub port: u16,
    pub source: DiscoverySource,
    pub vendor: Vendor,
    pub class: Class,
    pub idn: Option<Idn>,
    pub hostname: Option<String>,
    pub service_type: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct DiscoveryOptions {
    pub mdns: bool,
    pub sweep: bool,
    pub vxi11: bool,
    pub ports: Vec<u16>,
    pub connect_timeout_ms: u64,
    pub max_concurrency: usize,
    pub overall_timeout_ms: u64,
    pub subnet_max_prefix: u8,
}

impl Default for DiscoveryOptions {
    fn default() -> Self {
        Self {
            mdns: true,
            sweep: true,
            vxi11: true,
            ports: vec![5555, 5025, 4000], // Rigol, Siglent/Keysight, Tektronix
            connect_timeout_ms: 300,
            max_concurrency: 256,
            overall_timeout_ms: 8000,
            subnet_max_prefix: 24,
        }
    }
}

/// Internal messages from the three producers to the single consumer.
pub enum DiscoveryMsg {
    Device(DiscoveredDevice),
    SweepProgress { scanned: usize, total: usize },
    SourceDone(DiscoverySource),
    SourceError { source: DiscoverySource, message: String },
}

pub struct DiscoveryHandle {
    pub cancel: CancellationToken,
}

/// Spawn the discovery orchestrator; results stream to the frontend via events.
pub fn spawn_discovery(app: tauri::AppHandle, opts: DiscoveryOptions) -> DiscoveryHandle {
    let cancel = CancellationToken::new();
    tokio::spawn(run_discovery(app, opts, cancel.clone()));
    DiscoveryHandle { cancel }
}

/// Dedup preference: a reachable raw-socket port (+2) and a parsed `*IDN?` (+1)
/// rank a capturable/identified device (sweep) above a VXI-11-only stub.
fn device_rank(d: &DiscoveredDevice) -> u8 {
    let mut r = 0;
    if d.port != 0 {
        r += 2;
    }
    if d.idn.is_some() {
        r += 1;
    }
    r
}

/// The currently-connected instrument as a capturable discovered device, if any.
async fn connected_device(app: &tauri::AppHandle) -> Option<DiscoveredDevice> {
    use tauri::Manager;
    let state = app.state::<crate::state::AppState>();
    let guard = state.conn.lock().await;
    let conn = guard.as_ref()?;
    Some(DiscoveredDevice {
        ip: conn.addr.ip(),
        port: conn.addr.port(),
        source: DiscoverySource::Sweep,
        vendor: conn.vendor,
        class: conn.class,
        idn: Some(conn.idn.clone()),
        hostname: None,
        service_type: None,
    })
}

async fn run_discovery(app: tauri::AppHandle, opts: DiscoveryOptions, cancel: CancellationToken) {
    let (tx, mut rx) = mpsc::channel::<DiscoveryMsg>(1024);

    let mut set = tokio::task::JoinSet::new();
    if opts.mdns {
        let (t, c) = (tx.clone(), cancel.clone());
        set.spawn(async move {
            if let Err(e) = mdns::run(t.clone(), c).await {
                let _ = t
                    .send(DiscoveryMsg::SourceError {
                        source: DiscoverySource::Mdns,
                        message: e.to_string(),
                    })
                    .await;
            }
        });
    }
    if opts.sweep {
        let (t, c, o) = (tx.clone(), cancel.clone(), opts.clone());
        set.spawn(async move {
            if let Err(e) = sweep::run(t.clone(), c, o).await {
                let _ = t
                    .send(DiscoveryMsg::SourceError {
                        source: DiscoverySource::Sweep,
                        message: e.to_string(),
                    })
                    .await;
            }
        });
    }
    if opts.vxi11 {
        let (t, c, o) = (tx.clone(), cancel.clone(), opts.clone());
        set.spawn(async move {
            if let Err(e) = vxi11::run(t.clone(), c, o).await {
                let _ = t
                    .send(DiscoveryMsg::SourceError {
                        source: DiscoverySource::Vxi11,
                        message: e.to_string(),
                    })
                    .await;
            }
        });
    }
    drop(tx); // last sender: rx closes once all producers finish

    let deadline = tokio::time::sleep(Duration::from_millis(opts.overall_timeout_ms));
    tokio::pin!(deadline);

    let mut best: HashMap<IpAddr, u8> = HashMap::new();
    let mut total_found = 0usize;

    let _ = app.emit(events::DISCOVERY_STARTED, ());

    // Seed the currently-connected instrument: its single raw-socket session is
    // held by us, so the sweep can't re-probe it — without this it would appear
    // as a non-capturable VXI-11 stub on a re-scan.
    if let Some(dev) = connected_device(&app).await {
        best.insert(dev.ip, device_rank(&dev));
        total_found += 1;
        let _ = app.emit(events::DISCOVERY_DEVICE, &dev);
    }

    loop {
        tokio::select! {
            _ = &mut deadline => {
                cancel.cancel();
                break;
            }
            _ = cancel.cancelled() => break,
            msg = rx.recv() => match msg {
                None => break,
                Some(DiscoveryMsg::Device(d)) => {
                    let rank = device_rank(&d);
                    match best.get(&d.ip).copied() {
                        None => {
                            best.insert(d.ip, rank);
                            total_found += 1;
                            let _ = app.emit(events::DISCOVERY_DEVICE, &d);
                        }
                        // A better source superseded a weaker one for the same IP
                        // (e.g. the sweep's capturable entry over a VXI-11 stub).
                        // Re-emit the upgrade; the UI upserts by IP.
                        Some(prev) if rank > prev => {
                            best.insert(d.ip, rank);
                            let _ = app.emit(events::DISCOVERY_DEVICE, &d);
                        }
                        _ => {}
                    }
                }
                Some(DiscoveryMsg::SweepProgress { scanned, total }) => {
                    let _ = app.emit(events::DISCOVERY_PROGRESS, events::Progress { scanned, total });
                }
                Some(DiscoveryMsg::SourceDone(source)) => {
                    let _ = app.emit(events::DISCOVERY_SOURCE_DONE, events::SourceDoneEvt { source });
                }
                Some(DiscoveryMsg::SourceError { source, message }) => {
                    let _ = app.emit(events::DISCOVERY_ERROR, events::SourceErrorEvt { source, message });
                }
            }
        }
    }

    cancel.cancel();
    set.shutdown().await; // abort + join any producers still running
    let _ = app.emit(events::DISCOVERY_COMPLETE, events::Complete { total_found });
}
