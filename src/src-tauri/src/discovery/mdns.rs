//! mDNS / DNS-SD browse of the LXI service types.

use futures::stream::{select_all, StreamExt};
use mdns_sd::{ServiceDaemon, ServiceEvent};
use tokio::sync::mpsc::Sender;
use tokio_util::sync::CancellationToken;

use crate::discovery::{DiscoveredDevice, DiscoveryMsg, DiscoverySource};
use crate::error::AppResult;
use crate::instrument::idn::{Class, Vendor};

/// Browse order matters: `_scpi-raw` is the raw SCPI socket we actually want;
/// the rest are advertised by LXI gear generally.
pub const SERVICES: [&str; 4] = [
    "_scpi-raw._tcp.local.",
    "_lxi._tcp.local.",
    "_vxi-11._tcp.local.",
    "_hislip._tcp.local.",
];

pub async fn run(tx: Sender<DiscoveryMsg>, cancel: CancellationToken) -> AppResult<()> {
    // The daemon must stay owned for the whole browse; dropping it stops mDNS.
    let daemon = ServiceDaemon::new()?;
    let mut streams = Vec::new();
    for service in SERVICES {
        streams.push(daemon.browse(service)?.into_stream());
    }
    let mut merged = select_all(streams);

    loop {
        tokio::select! {
            _ = cancel.cancelled() => break,
            ev = merged.next() => match ev {
                None => break,
                Some(ServiceEvent::ServiceResolved(info)) => {
                    // mdns-sd 0.20: ResolvedService with public fields; addresses
                    // are ScopedIp (IPv4/IPv6 + interface scope).
                    let service_type = info.ty_domain.clone();
                    // Only `_scpi-raw` advertises the raw-socket capture port; the
                    // other LXI service types advertise the web / VXI-11 port, so
                    // fall back to the IANA scpi-raw port (5025) to stay connectable.
                    let port = if service_type.starts_with("_scpi-raw") {
                        info.port
                    } else {
                        5025
                    };
                    let hostname = info.host.clone();
                    for scoped in info.addresses.iter() {
                        let ip = scoped.to_ip_addr();
                        // The capture path is IPv4 raw sockets. Skip IPv6 - an IPv6
                        // entry can't be connected here and won't dedup against the
                        // sweep's IPv4, so it shows up as a second, dead entry.
                        if !ip.is_ipv4() {
                            continue;
                        }
                        let _ = tx
                            .send(DiscoveryMsg::Device(DiscoveredDevice {
                                ip,
                                port,
                                source: DiscoverySource::Mdns,
                                vendor: Vendor::Unknown,
                                class: Class::Other,
                                idn: None,
                                hostname: Some(hostname.clone()),
                                service_type: Some(service_type.clone()),
                            }))
                            .await;
                    }
                }
                Some(_) => {} // SearchStarted / ServiceFound / ServiceRemoved / SearchStopped
            }
        }
    }

    let _ = daemon.shutdown();
    let _ = tx.send(DiscoveryMsg::SourceDone(DiscoverySource::Mdns)).await;
    Ok(())
}
