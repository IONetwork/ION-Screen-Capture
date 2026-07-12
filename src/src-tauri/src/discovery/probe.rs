//! Shared TCP probe: connect, send `*IDN?`, validate the reply.

use std::net::SocketAddr;
use std::time::Duration;

use tokio::net::TcpStream;

use crate::instrument::idn::{detect_class, detect_vendor, parse_idn, Class, Idn, Vendor};
use crate::transport::{ScpiIo, Transport};

pub struct Probed {
    pub idn: Idn,
    pub vendor: Vendor,
    pub class: Class,
}

/// Open a short-lived socket, send `*IDN?`, and validate the response.
/// Returns `None` on any failure (closed port, timeout, non-SCPI reply) — the
/// socket is dropped immediately so we never hold a session open.
pub async fn probe(
    addr: SocketAddr,
    connect_timeout: Duration,
    read_timeout: Duration,
) -> Option<Probed> {
    let stream = tokio::time::timeout(connect_timeout, TcpStream::connect(addr))
        .await
        .ok()?
        .ok()?;
    let mut t = Transport::from_stream(stream, read_timeout).ok()?;
    let resp = t.query("*IDN?").await.ok()?;
    let idn = parse_idn(&resp).ok()?;
    let vendor = detect_vendor(&idn);
    let class = detect_class(vendor, &idn);
    Some(Probed { idn, vendor, class })
}
