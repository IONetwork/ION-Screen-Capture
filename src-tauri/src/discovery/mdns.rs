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
                    let port = info.port;
                    let hostname = info.host.clone();
                    let service_type = info.ty_domain.clone();
                    for scoped in info.addresses.iter() {
                        let _ = tx
                            .send(DiscoveryMsg::Device(DiscoveredDevice {
                                ip: scoped.to_ip_addr(),
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
