//! Subnet sweep: parallel TCP `*IDN?` probes across the local /24(s). This is
//! the primary path for gear that does not mDNS-advertise (e.g. Rigol DS1000Z).

use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::time::Duration;

use futures::stream::{self, StreamExt};
use tokio::sync::mpsc::Sender;
use tokio_util::sync::CancellationToken;

use crate::discovery::{probe, DiscoveredDevice, DiscoveryMsg, DiscoveryOptions, DiscoverySource};
use crate::error::{AppError, AppResult};

pub async fn run(
    tx: Sender<DiscoveryMsg>,
    cancel: CancellationToken,
    opts: DiscoveryOptions,
) -> AppResult<()> {
    let targets = enumerate_targets(&opts)?;
    let total = targets.len();
    let connect_to = Duration::from_millis(opts.connect_timeout_ms);
    // Only OPEN ports reach the `*IDN?` read, so a generous read timeout is
    // cheap — and necessary: some scopes (Rigol DS1000Z) answer slower than a
    // tight timeout, which was making the sweep intermittently miss them.
    let read_to = Duration::from_millis(1500);

    let mut probes = stream::iter(targets)
        .map(|addr| {
            let cancel = cancel.clone();
            async move {
                tokio::select! {
                    _ = cancel.cancelled() => (addr, None),
                    r = probe::probe(addr, connect_to, read_to) => (addr, r),
                }
            }
        })
        .buffer_unordered(opts.max_concurrency);

    let mut scanned = 0usize;
    while let Some((addr, probed)) = probes.next().await {
        scanned += 1;
        let _ = tx.send(DiscoveryMsg::SweepProgress { scanned, total }).await;
        if let Some(p) = probed {
            let _ = tx
                .send(DiscoveryMsg::Device(DiscoveredDevice {
                    ip: addr.ip(),
                    port: addr.port(),
                    source: DiscoverySource::Sweep,
                    vendor: p.vendor,
                    class: p.class,
                    idn: Some(p.idn),
                    hostname: None,
                    service_type: None,
                }))
                .await;
        }
        if cancel.is_cancelled() {
            break;
        }
    }

    let _ = tx.send(DiscoveryMsg::SourceDone(DiscoverySource::Sweep)).await;
    Ok(())
}

/// Enumerate `(host, port)` targets: IPv4 · non-loopback · private interfaces,
/// each subnet clamped to at most `/subnet_max_prefix`, crossed with the ports.
fn enumerate_targets(opts: &DiscoveryOptions) -> AppResult<Vec<SocketAddr>> {
    let mut seen_subnets: Vec<(Ipv4Addr, Ipv4Addr)> = Vec::new();
    let mut out = Vec::new();

    for iface in if_addrs::get_if_addrs()? {
        if iface.is_loopback() {
            continue;
        }
        if let if_addrs::IfAddr::V4(v4) = iface.addr {
            if !v4.ip.is_private() {
                continue;
            }
            let key = (v4.ip, v4.netmask);
            if seen_subnets.contains(&key) {
                continue;
            }
            seen_subnets.push(key);
            for host in hosts_in(v4.ip, v4.netmask, opts.subnet_max_prefix) {
                for &port in &opts.ports {
                    out.push(SocketAddr::new(IpAddr::V4(host), port));
                }
            }
        }
    }

    if out.is_empty() {
        return Err(AppError::NoInterface);
    }
    Ok(out)
}

/// Host addresses in the interface's subnet, clamped to at most `max_prefix`
/// (default /24 → 254 hosts), excluding the network and broadcast addresses.
fn hosts_in(ip: Ipv4Addr, netmask: Ipv4Addr, max_prefix: u8) -> Vec<Ipv4Addr> {
    let ip_u = u32::from(ip);
    let prefix = u32::from(netmask).count_ones() as u8;
    // Use the tighter of the interface prefix and the clamp (larger prefix =
    // smaller network) so a /16 interface still only sweeps a /24.
    let eff_prefix = prefix.max(max_prefix).min(32);
    let host_bits = 32 - eff_prefix as u32;

    if host_bits == 0 || host_bits > 16 {
        // /32 (nothing to sweep) or an implausibly large net → sweep the /24 around ip.
        let base = ip_u & !0xFFu32;
        return (1u32..=254).map(|h| Ipv4Addr::from(base | h)).collect();
    }

    let eff_mask = u32::MAX << host_bits;
    let network = ip_u & eff_mask;
    let count = 1u32 << host_bits;
    (1..count.saturating_sub(1))
        .map(|i| Ipv4Addr::from(network | i))
        .collect()
}
