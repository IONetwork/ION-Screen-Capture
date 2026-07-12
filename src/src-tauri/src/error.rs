//! Backend error type. Serialized to the frontend as `{ kind, message }` so the
//! UI can switch on `kind` programmatically and show `message` to the user.

use serde::{ser::SerializeStruct, Serialize, Serializer};

pub type AppResult<T> = Result<T, AppError>;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("not connected to an instrument")]
    NotConnected,
    #[error("no capture available yet")]
    NoCapture,
    #[error("connect to {addr} timed out after {timeout_ms} ms")]
    ConnectTimeout { addr: String, timeout_ms: u64 },
    #[error("operation timed out after {0} ms")]
    Timeout(u64),
    #[error("malformed IEEE 488.2 block: {0}")]
    BadBlock(String),
    #[error("SCPI protocol error: {0}")]
    Protocol(String),
    #[error("could not identify instrument from *IDN? response {0:?}")]
    UnknownInstrument(String),
    #[error("{vendor} does not support {what}")]
    Unsupported { vendor: String, what: String },
    #[error("no usable network interface found")]
    NoInterface,
    #[error("mDNS error: {0}")]
    Mdns(#[from] mdns_sd::Error),
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),
    #[error("filesystem error: {0}")]
    Fs(String),
}

impl AppError {
    /// Stable machine-readable tag sent to the frontend.
    pub fn kind(&self) -> &'static str {
        match self {
            AppError::NotConnected => "NotConnected",
            AppError::NoCapture => "NoCapture",
            AppError::ConnectTimeout { .. } => "ConnectTimeout",
            AppError::Timeout(_) => "Timeout",
            AppError::BadBlock(_) => "BadBlock",
            AppError::Protocol(_) => "Protocol",
            AppError::UnknownInstrument(_) => "UnknownInstrument",
            AppError::Unsupported { .. } => "Unsupported",
            AppError::NoInterface => "NoInterface",
            AppError::Mdns(_) => "Mdns",
            AppError::Io(_) => "Io",
            AppError::Fs(_) => "Fs",
        }
    }
}

impl Serialize for AppError {
    fn serialize<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        let mut st = s.serialize_struct("AppError", 2)?;
        st.serialize_field("kind", self.kind())?;
        st.serialize_field("message", &self.to_string())?;
        st.end()
    }
}
