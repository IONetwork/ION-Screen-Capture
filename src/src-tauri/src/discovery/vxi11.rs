//! VXI-11 discovery via an ONC-RPC (Sun RPC) portmapper broadcast on UDP/111.
//! Catches older gear (e.g. Rigol DS1000Z) that the mass sweep can miss under
//! its connect storm. Each responder is a real instrument, so we then probe its
//! raw-socket ports in isolation (few devices, generous timeout) to surface it
//! as *capturable* rather than a non-capturable stub.

use std::collections::HashSet;
use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::time::Duration;

use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpStream, UdpSocket};
use tokio::sync::mpsc::Sender;
use tokio::task::JoinSet;
use tokio_util::sync::CancellationToken;

use crate::discovery::{probe, DiscoveredDevice, DiscoveryMsg, DiscoveryOptions, DiscoverySource};
use crate::error::{AppError, AppResult};
use crate::instrument::idn::{Class, Vendor};

const PMAP_PROG: u32 = 100_000;
const PMAP_VERS: u32 = 2;
const PMAP_GETPORT: u32 = 3;
const VXI11_CORE_PROG: u32 = 0x0006_07AF; // 395183
const VXI11_CORE_VERS: u32 = 1;
const IPPROTO_TCP: u32 = 6;
const XID: u32 = 0x4649_5245; // "FIRE"

fn push_u32(b: &mut Vec<u8>, v: u32) {
    b.extend_from_slice(&v.to_be_bytes());
}

/// Build a portmap GETPORT CALL asking for the VXI-11 Core channel's TCP port.
fn build_getport() -> Vec<u8> {
    let mut b = Vec::with_capacity(56);
    push_u32(&mut b, XID);
    push_u32(&mut b, 0); // msg_type = CALL
    push_u32(&mut b, 2); // rpcvers
    push_u32(&mut b, PMAP_PROG);
    push_u32(&mut b, PMAP_VERS);
    push_u32(&mut b, PMAP_GETPORT);
    // cred (AUTH_NULL): flavor=0, length=0
    push_u32(&mut b, 0);
    push_u32(&mut b, 0);
    // verf (AUTH_NULL): flavor=0, length=0
    push_u32(&mut b, 0);
    push_u32(&mut b, 0);
    // GETPORT args: mapping { prog, vers, prot, port }
    push_u32(&mut b, VXI11_CORE_PROG);
    push_u32(&mut b, VXI11_CORE_VERS);
    push_u32(&mut b, IPPROTO_TCP);
    push_u32(&mut b, 0);
    b
}

/// Parse the assigned port from a portmap GETPORT reply. `None` unless it is an
/// accepted, successful reply carrying a non-zero port.
fn parse_getport_port(buf: &[u8]) -> Option<u16> {
    let be = |o: usize| -> Option<u32> {
        buf.get(o..o + 4)
            .map(|s| u32::from_be_bytes([s[0], s[1], s[2], s[3]]))
    };
    if be(4)? != 1 {
        return None; // not a REPLY
    }
    if be(8)? != 0 {
        return None; // not MSG_ACCEPTED
    }
    let verf_len = be(16)? as usize;
    let pad = (4 - (verf_len % 4)) % 4;
    let off = 20 + verf_len + pad;
    if be(off)? != 0 {
        return None; // accept_stat != SUCCESS
    }
    let port = be(off + 4)?;
    if port == 0 || port > u16::MAX as u32 {
        return None;
    }
    Some(port as u16)
}

pub async fn run(
    tx: Sender<DiscoveryMsg>,
    cancel: CancellationToken,
    opts: DiscoveryOptions,
) -> AppResult<()> {
    let sock = UdpSocket::bind(("0.0.0.0", 0)).await?;
    sock.set_broadcast(true)?;
    let pkt = build_getport();

    for bcast in broadcast_addrs() {
        let _ = sock.send_to(&pkt, SocketAddr::new(IpAddr::V4(bcast), 111)).await;
    }

    let mut probes = JoinSet::new();
    let mut seen: HashSet<IpAddr> = HashSet::new();
    let mut buf = [0u8; 1500];
    loop {
        tokio::select! {
            _ = cancel.cancelled() => break,
            r = sock.recv_from(&mut buf) => match r {
                Ok((n, from)) => {
                    if parse_getport_port(&buf[..n]).is_some() && seen.insert(from.ip()) {
                        let tx = tx.clone();
                        let cancel = cancel.clone();
                        let ports = opts.ports.clone();
                        let ip = from.ip();
                        probes.spawn(async move { probe_and_emit(tx, ip, ports, cancel).await });
                    }
                }
                Err(_) => break,
            }
        }
    }

    // Let the isolated raw-socket probes finish (they honor the cancel token).
    while probes.join_next().await.is_some() {}
    let _ = tx.send(DiscoveryMsg::SourceDone(DiscoverySource::Vxi11)).await;
    Ok(())
}

/// Probe a VXI-11 responder's raw-socket ports; emit a capturable device on the
/// first that answers `*IDN?`, else a VXI-11-only stub.
async fn probe_and_emit(
    tx: Sender<DiscoveryMsg>,
    ip: IpAddr,
    ports: Vec<u16>,
    cancel: CancellationToken,
) {
    let connect_to = Duration::from_millis(800);
    let read_to = Duration::from_millis(1500);
    for port in ports {
        if cancel.is_cancelled() {
            return;
        }
        if let Some(p) = probe::probe(SocketAddr::new(ip, port), connect_to, read_to).await {
            let _ = tx
                .send(DiscoveryMsg::Device(DiscoveredDevice {
                    ip,
                    port,
                    source: DiscoverySource::Vxi11,
                    vendor: p.vendor,
                    class: p.class,
                    idn: Some(p.idn),
                    hostname: None,
                    service_type: Some("vxi-11".into()),
                }))
                .await;
            return;
        }
    }
    // No raw socket answered - surface as a VXI-11-only (non-capturable) device.
    let _ = tx
        .send(DiscoveryMsg::Device(DiscoveredDevice {
            ip,
            port: 0,
            source: DiscoverySource::Vxi11,
            vendor: Vendor::Unknown,
            class: Class::Other,
            idn: None,
            hostname: None,
            service_type: Some("vxi-11".into()),
        }))
        .await;
}

/// Broadcast addresses for private IPv4 interfaces.
fn broadcast_addrs() -> Vec<Ipv4Addr> {
    let mut out = Vec::new();
    if let Ok(ifaces) = if_addrs::get_if_addrs() {
        for iface in ifaces {
            if iface.is_loopback() {
                continue;
            }
            if let if_addrs::IfAddr::V4(v4) = iface.addr {
                if !v4.ip.is_private() {
                    continue;
                }
                match v4.broadcast {
                    Some(b) => out.push(b),
                    None => {
                        let derived = u32::from(v4.ip) | !u32::from(v4.netmask);
                        out.push(Ipv4Addr::from(derived));
                    }
                }
            }
        }
    }
    out
}

// --- VXI-11 control channel: return an instrument to LOCAL (device_local) ---
//
// The LXI/Ethernet equivalent of the GPIB "Go To Local" (GTL) bus message,
// carried as ONC-RPC calls on the VXI-11 Core channel. Used for gear with no
// raw-socket local command (Keysight/Rigol-DM858 Truevolt DMMs). Best-effort.

const VXI11_CREATE_LINK: u32 = 10;
const VXI11_DEVICE_LOCAL: u32 = 17;
const VXI11_DESTROY_LINK: u32 = 23;

/// XDR string: u32 length, bytes, zero-padded to a 4-byte boundary.
fn push_str(b: &mut Vec<u8>, s: &str) {
    push_u32(b, s.len() as u32);
    b.extend_from_slice(s.as_bytes());
    for _ in 0..((4 - (s.len() % 4)) % 4) {
        b.push(0);
    }
}

/// Frame an ONC-RPC CALL (AUTH_NULL) to the VXI-11 Core channel with a TCP
/// record marker (single, last fragment).
fn rpc_call(xid: u32, proc_num: u32, args: &[u8]) -> Vec<u8> {
    let mut m = Vec::with_capacity(40 + args.len());
    push_u32(&mut m, xid);
    push_u32(&mut m, 0); // msg_type = CALL
    push_u32(&mut m, 2); // rpcvers
    push_u32(&mut m, VXI11_CORE_PROG);
    push_u32(&mut m, VXI11_CORE_VERS);
    push_u32(&mut m, proc_num);
    push_u32(&mut m, 0); // cred: AUTH_NULL flavor
    push_u32(&mut m, 0); // cred: length
    push_u32(&mut m, 0); // verf: AUTH_NULL flavor
    push_u32(&mut m, 0); // verf: length
    m.extend_from_slice(args);
    let mut framed = Vec::with_capacity(4 + m.len());
    push_u32(&mut framed, 0x8000_0000 | m.len() as u32); // record marker (last frag)
    framed.extend_from_slice(&m);
    framed
}

/// Slice past an accepted RPC reply header to the procedure results.
fn rpc_results(buf: &[u8]) -> Option<&[u8]> {
    let be = |o: usize| -> Option<u32> {
        buf.get(o..o + 4)
            .map(|s| u32::from_be_bytes([s[0], s[1], s[2], s[3]]))
    };
    if be(4)? != 1 || be(8)? != 0 {
        return None; // not an accepted REPLY
    }
    let verf_len = be(16)? as usize;
    let pad = (4 - (verf_len % 4)) % 4;
    let off = 20 + verf_len + pad;
    if be(off)? != 0 {
        return None; // accept_stat != SUCCESS
    }
    buf.get(off + 4..)
}

/// Read one record-marked RPC reply (single fragment) from a TCP stream.
async fn read_record(stream: &mut TcpStream) -> Option<Vec<u8>> {
    let mut marker = [0u8; 4];
    stream.read_exact(&mut marker).await.ok()?;
    let len = (u32::from_be_bytes(marker) & 0x7fff_ffff) as usize;
    if len == 0 || len > 8192 {
        return None;
    }
    let mut buf = vec![0u8; len];
    stream.read_exact(&mut buf).await.ok()?;
    Some(buf)
}

/// Unicast portmap GETPORT to `ip:111` → the VXI-11 Core channel's TCP port.
async fn core_port(ip: IpAddr) -> Option<u16> {
    let sock = UdpSocket::bind(("0.0.0.0", 0)).await.ok()?;
    sock.send_to(&build_getport(), SocketAddr::new(ip, 111))
        .await
        .ok()?;
    let mut buf = [0u8; 1500];
    let (n, _) = tokio::time::timeout(Duration::from_millis(600), sock.recv_from(&mut buf))
        .await
        .ok()?
        .ok()?;
    parse_getport_port(&buf[..n])
}

/// Return the instrument at `ip` to LOCAL via the VXI-11 `device_local` RPC.
/// Best-effort with short timeouts - for DMMs with no raw-socket local command.
pub async fn device_local(ip: IpAddr) -> AppResult<()> {
    let port = core_port(ip)
        .await
        .ok_or_else(|| AppError::Protocol("VXI-11 portmap: no Core port".into()))?;

    let mut stream = tokio::time::timeout(
        Duration::from_millis(800),
        TcpStream::connect(SocketAddr::new(ip, port)),
    )
    .await
    .map_err(|_| AppError::Protocol("VXI-11 Core connect timed out".into()))?
    .map_err(AppError::Io)?;

    let io_to = Duration::from_millis(1500);

    // create_link { clientId, lockDevice=false, lock_timeout=0, device="inst0" }
    let mut args = Vec::new();
    push_u32(&mut args, XID);
    push_u32(&mut args, 0);
    push_u32(&mut args, 0);
    push_str(&mut args, "inst0");
    stream
        .write_all(&rpc_call(XID, VXI11_CREATE_LINK, &args))
        .await
        .map_err(AppError::Io)?;
    let reply = tokio::time::timeout(io_to, read_record(&mut stream))
        .await
        .map_err(|_| AppError::Protocol("VXI-11 create_link timed out".into()))?
        .ok_or_else(|| AppError::Protocol("VXI-11 create_link: bad reply".into()))?;
    let res =
        rpc_results(&reply).ok_or_else(|| AppError::Protocol("VXI-11 create_link rejected".into()))?;
    let be = |o: usize| -> Option<u32> {
        res.get(o..o + 4)
            .map(|s| u32::from_be_bytes([s[0], s[1], s[2], s[3]]))
    };
    let (Some(0), Some(lid)) = (be(0), be(4)) else {
        return Err(AppError::Protocol("VXI-11 create_link error".into()));
    };

    // device_local { lid, flags=0, lock_timeout=0, io_timeout }
    let mut args = Vec::new();
    push_u32(&mut args, lid);
    push_u32(&mut args, 0);
    push_u32(&mut args, 0);
    push_u32(&mut args, 1000);
    stream
        .write_all(&rpc_call(XID.wrapping_add(1), VXI11_DEVICE_LOCAL, &args))
        .await
        .map_err(AppError::Io)?;
    let _ = tokio::time::timeout(io_to, read_record(&mut stream)).await;

    // destroy_link { lid } - cleanup, ignore result.
    let mut args = Vec::new();
    push_u32(&mut args, lid);
    let _ = stream
        .write_all(&rpc_call(XID.wrapping_add(2), VXI11_DESTROY_LINK, &args))
        .await;
    let _ = tokio::time::timeout(io_to, read_record(&mut stream)).await;

    Ok(())
}
