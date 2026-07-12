//! SCPI transport: the `ScpiIo` I/O seam and a buffered TCP `Transport`.

pub mod block;

use std::net::SocketAddr;
use std::time::Duration;

use async_trait::async_trait;
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::net::tcp::{OwnedReadHalf, OwnedWriteHalf};
use tokio::net::TcpStream;

use crate::error::{AppError, AppResult};

/// Everything a vendor driver needs from the wire. Object-safe (`&mut dyn ScpiIo`)
/// via `async_trait`, so each driver is unit-tested against a mock transport
/// (`tokio::io::duplex`) without a socket or hardware.
#[async_trait]
pub trait ScpiIo: Send {
    /// Write an ASCII command, append CRLF, and flush.
    async fn write_line(&mut self, cmd: &str) -> AppResult<()>;
    /// Write raw bytes (already including any terminator) and flush.
    async fn write_raw(&mut self, bytes: &[u8]) -> AppResult<()>;
    /// Read one line, trimming a trailing CR/LF. Used by `*IDN?` etc.
    async fn read_line(&mut self) -> AppResult<String>;
    /// Read one IEEE 488.2 definite-length block (framed screenshots).
    async fn read_block(&mut self) -> AppResult<Vec<u8>>;
    /// Read a bare, unframed byte stream until the socket goes idle. For vendors
    /// that stream a raw image file with no length header (Siglent `SCDP`,
    /// Tektronix `FILESystem:READFile`). `idle_ms` is the post-data quiet gap
    /// that marks end-of-transfer; the first read waits the full I/O timeout.
    async fn read_stream_idle(&mut self, idle_ms: u64, max_bytes: usize) -> AppResult<Vec<u8>>;

    /// Write `cmd`, then read one line.
    async fn query(&mut self, cmd: &str) -> AppResult<String> {
        self.write_line(cmd).await?;
        self.read_line().await
    }
    /// Write `cmd`, then read one IEEE 488.2 block.
    async fn query_block(&mut self, cmd: &str) -> AppResult<Vec<u8>> {
        self.write_line(cmd).await?;
        self.read_block().await
    }
}

/// Buffered TCP transport. The stream is split so reads are buffered (bulk,
/// not byte-at-a-time) while writes go direct.
pub struct Transport {
    reader: BufReader<OwnedReadHalf>,
    writer: OwnedWriteHalf,
    peer: SocketAddr,
    io_timeout: Duration,
}

impl Transport {
    /// Connect with a bounded connect timeout and a per-operation I/O timeout.
    pub async fn connect(
        addr: SocketAddr,
        connect_timeout: Duration,
        io_timeout: Duration,
    ) -> AppResult<Self> {
        let stream = tokio::time::timeout(connect_timeout, TcpStream::connect(addr))
            .await
            .map_err(|_| AppError::ConnectTimeout {
                addr: addr.to_string(),
                timeout_ms: connect_timeout.as_millis() as u64,
            })??;
        Self::from_stream(stream, io_timeout)
    }

    /// Wrap an already-connected stream (used by the discovery probe).
    pub fn from_stream(stream: TcpStream, io_timeout: Duration) -> AppResult<Self> {
        let _ = stream.set_nodelay(true);
        let peer = stream.peer_addr()?;
        let (r, w) = stream.into_split();
        Ok(Self {
            reader: BufReader::with_capacity(64 * 1024, r),
            writer: w,
            peer,
            io_timeout,
        })
    }

    pub fn peer(&self) -> SocketAddr {
        self.peer
    }
}

#[async_trait]
impl ScpiIo for Transport {
    async fn write_line(&mut self, cmd: &str) -> AppResult<()> {
        let ms = self.io_timeout.as_millis() as u64;
        let dur = self.io_timeout;
        let w = &mut self.writer;
        let fut = async move {
            w.write_all(cmd.as_bytes()).await?;
            w.write_all(b"\r\n").await?;
            w.flush().await?;
            Ok::<(), std::io::Error>(())
        };
        tokio::time::timeout(dur, fut)
            .await
            .map_err(|_| AppError::Timeout(ms))??;
        Ok(())
    }

    async fn write_raw(&mut self, bytes: &[u8]) -> AppResult<()> {
        let ms = self.io_timeout.as_millis() as u64;
        let dur = self.io_timeout;
        let w = &mut self.writer;
        let fut = async move {
            w.write_all(bytes).await?;
            w.flush().await?;
            Ok::<(), std::io::Error>(())
        };
        tokio::time::timeout(dur, fut)
            .await
            .map_err(|_| AppError::Timeout(ms))??;
        Ok(())
    }

    async fn read_line(&mut self) -> AppResult<String> {
        let ms = self.io_timeout.as_millis() as u64;
        let dur = self.io_timeout;
        let mut buf = Vec::with_capacity(128);
        let n = tokio::time::timeout(dur, self.reader.read_until(b'\n', &mut buf))
            .await
            .map_err(|_| AppError::Timeout(ms))??;
        if n == 0 {
            return Err(AppError::Protocol(
                "connection closed while reading a line".into(),
            ));
        }
        while matches!(buf.last(), Some(b'\n') | Some(b'\r')) {
            buf.pop();
        }
        Ok(String::from_utf8_lossy(&buf).into_owned())
    }

    async fn read_block(&mut self) -> AppResult<Vec<u8>> {
        let ms = self.io_timeout.as_millis() as u64;
        let dur = self.io_timeout;
        let payload = tokio::time::timeout(dur, block::read_definite_block(&mut self.reader))
            .await
            .map_err(|_| AppError::Timeout(ms))??;
        // IEEE 488.2 block responses are followed by a trailing terminator (\n).
        // Drain it so a leftover 0x0A can't corrupt the next query's block header
        // (the bug where a 2nd capture failed). Short timeout so instruments that
        // omit the terminator don't stall.
        let _ = tokio::time::timeout(Duration::from_millis(80), self.reader.read_u8()).await;
        Ok(payload)
    }

    async fn read_stream_idle(&mut self, idle_ms: u64, max_bytes: usize) -> AppResult<Vec<u8>> {
        let first_wait = self.io_timeout;
        let first_ms = self.io_timeout.as_millis() as u64;
        let idle = Duration::from_millis(idle_ms);
        let mut out: Vec<u8> = Vec::with_capacity(64 * 1024);
        let mut chunk = [0u8; 8192];
        loop {
            let wait = if out.is_empty() { first_wait } else { idle };
            match tokio::time::timeout(wait, self.reader.read(&mut chunk)).await {
                Ok(Ok(0)) => break, // EOF
                Ok(Ok(n)) => {
                    out.extend_from_slice(&chunk[..n]);
                    if out.len() >= max_bytes {
                        break;
                    }
                }
                Ok(Err(e)) => return Err(AppError::from(e)),
                Err(_) => {
                    // A quiet gap: done if we already have data, else time out.
                    if out.is_empty() {
                        return Err(AppError::Timeout(first_ms));
                    }
                    break;
                }
            }
        }
        if out.is_empty() {
            return Err(AppError::Protocol("empty screen-capture stream".into()));
        }
        Ok(out)
    }
}
