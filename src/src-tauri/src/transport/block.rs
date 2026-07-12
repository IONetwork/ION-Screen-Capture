//! IEEE 488.2 definite-length arbitrary block reader.
//!
//! Wire format: `#` <nd: one ASCII digit> <len: nd ASCII digits> <payload: len bytes>
//! optionally followed by a trailing terminator (`\n`), which callers drain
//! separately since some vendors omit it. This replaces the legacy C#
//! byte-at-a-time read loop with a single bulk `read_exact` for the payload.

use tokio::io::{AsyncRead, AsyncReadExt};

use crate::error::{AppError, AppResult};

/// Read one IEEE 488.2 definite-length block from `r`.
///
/// Generic over `AsyncRead` so it is unit-tested against in-memory readers
/// (no socket, no hardware). The header bytes are individual reads that hit the
/// caller's buffer; the payload is one `read_exact`.
pub async fn read_definite_block<R>(r: &mut R) -> AppResult<Vec<u8>>
where
    R: AsyncRead + Unpin,
{
    let hash = r.read_u8().await?;
    if hash != b'#' {
        return Err(AppError::BadBlock(format!(
            "expected '#' (0x23) at block start, got 0x{hash:02X}"
        )));
    }

    let nd = r.read_u8().await?;
    if nd == b'0' {
        // "#0" = indefinite length (read until END/EOI). Not emitted by any
        // screenshot query and unsupported over a bare socket.
        return Err(AppError::BadBlock(
            "indefinite-length block (#0) is not supported".into(),
        ));
    }
    let ndigits = (nd as char)
        .to_digit(10)
        .ok_or_else(|| AppError::BadBlock(format!("length-digit count not a digit: 0x{nd:02X}")))?
        as usize;

    let mut len_buf = [0u8; 9]; // IEEE 488.2 permits at most 9 length digits
    r.read_exact(&mut len_buf[..ndigits]).await?;
    let len: usize = std::str::from_utf8(&len_buf[..ndigits])
        .ok()
        .and_then(|s| s.parse().ok())
        .ok_or_else(|| AppError::BadBlock("length field is not ASCII decimal".into()))?;

    let mut payload = vec![0u8; len];
    r.read_exact(&mut payload).await?;
    Ok(payload)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn reads_simple_block() {
        let mut src: &[u8] = b"#3004ABCD";
        let out = read_definite_block(&mut src).await.unwrap();
        assert_eq!(out, b"ABCD");
    }

    #[tokio::test]
    async fn reads_ds1000z_nine_digit_header() {
        // Rigol DS1000Z sends 9 length digits, e.g. #9000000004<data>.
        let mut buf = b"#9000000004".to_vec();
        buf.extend_from_slice(b"\x89PNG");
        let mut src: &[u8] = &buf;
        let out = read_definite_block(&mut src).await.unwrap();
        assert_eq!(out, b"\x89PNG");
    }

    #[tokio::test]
    async fn rejects_non_hash_header() {
        let mut src: &[u8] = b"XYZ";
        assert!(read_definite_block(&mut src).await.is_err());
    }

    #[tokio::test]
    async fn rejects_indefinite_block() {
        let mut src: &[u8] = b"#0whatever";
        assert!(read_definite_block(&mut src).await.is_err());
    }

    #[tokio::test]
    async fn errors_on_truncated_payload() {
        // header promises 10 bytes; only 3 present -> read_exact hits EOF
        let mut src: &[u8] = b"#210ABC";
        assert!(read_definite_block(&mut src).await.is_err());
    }
}
