//! Instrument identity: parse `*IDN?` and classify vendor + instrument class.

use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Vendor {
    Rigol,
    Siglent,
    Keysight,
    Tektronix,
    Unknown,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Class {
    Oscilloscope,
    Dmm,
    Awg,
    Other,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Idn {
    pub manufacturer: String,
    pub model: String,
    pub serial: String,
    pub firmware: String,
    pub raw: String,
}

/// Parse a `*IDN?` response: `<manufacturer>,<model>,<serial>,<firmware...>`.
///
/// Lenient: strips a leading `:` (seen on some Tektronix), trims whitespace,
/// and treats everything after the third comma as the firmware field (vendor
/// firmware fields sometimes contain extra commas/spaces).
pub fn parse_idn(raw: &str) -> AppResult<Idn> {
    let trimmed = raw.trim().trim_start_matches(':').trim();
    if trimmed.is_empty() {
        return Err(AppError::UnknownInstrument(raw.to_string()));
    }
    let mut parts = trimmed.splitn(4, ',');
    let manufacturer = parts.next().unwrap_or("").trim().to_string();
    let model = parts.next().unwrap_or("").trim().to_string();
    let serial = parts.next().unwrap_or("").trim().to_string();
    let firmware = parts.next().unwrap_or("").trim().to_string();
    if manufacturer.is_empty() || model.is_empty() {
        return Err(AppError::UnknownInstrument(raw.to_string()));
    }
    Ok(Idn {
        manufacturer,
        model,
        serial,
        firmware,
        raw: trimmed.to_string(),
    })
}

/// Detect the vendor from the manufacturer field (case-insensitive substring).
pub fn detect_vendor(idn: &Idn) -> Vendor {
    let m = idn.manufacturer.to_ascii_uppercase();
    if m.contains("RIGOL") {
        Vendor::Rigol
    } else if m.contains("SIGLENT") {
        Vendor::Siglent
    } else if m.contains("KEYSIGHT") || m.contains("AGILENT") || m.contains("HEWLETT") {
        Vendor::Keysight
    } else if m.contains("TEKTRONIX") || m == "TEK" || m.starts_with("TEK ") {
        Vendor::Tektronix
    } else {
        Vendor::Unknown
    }
}

/// Classify the instrument class from the model token. Uses a DMM allowlist
/// first (most robust), then scope shapes; everything else is `Other`.
pub fn detect_class(vendor: Vendor, idn: &Idn) -> Class {
    let model = idn.model.to_ascii_uppercase();

    let is_dmm = match vendor {
        Vendor::Keysight => matches!(
            model.as_str(),
            "34401A"
                | "34410A"
                | "34411A"
                | "L4411A"
                | "34460A"
                | "34461A"
                | "34465A"
                | "34470A"
                | "EDU34450A"
                | "AT34410A"
                | "AT34411A"
                | "AT34460A"
                | "AT34461A"
                | "HP34401A"
        ),
        Vendor::Rigol => model.starts_with("DM"),
        Vendor::Siglent => model.starts_with("SDM"),
        _ => false,
    };
    if is_dmm {
        return Class::Dmm;
    }

    // Rigol DG models: function/arbitrary waveform generator (screenshot via :HCOPy).
    if matches!(vendor, Vendor::Rigol) && model.starts_with("DG") {
        return Class::Awg;
    }

    let is_scope = match vendor {
        Vendor::Keysight => {
            model.starts_with("DSO") || model.starts_with("MSO") || model.starts_with("EDUX")
        }
        Vendor::Rigol => {
            model.starts_with("DS") || model.starts_with("MSO") || model.starts_with("DHO")
        }
        Vendor::Siglent => model.starts_with("SDS"),
        Vendor::Tektronix => {
            model.starts_with("MSO") || model.starts_with("DPO") || model.starts_with("MDO")
        }
        Vendor::Unknown => false,
    };
    if is_scope {
        Class::Oscilloscope
    } else {
        Class::Other
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn idn(m: &str, model: &str) -> Idn {
        Idn {
            manufacturer: m.into(),
            model: model.into(),
            serial: "0".into(),
            firmware: "1".into(),
            raw: String::new(),
        }
    }

    #[test]
    fn parses_rigol_scope() {
        let i = parse_idn("RIGOL TECHNOLOGIES,DS1104Z,DS1ZA1,00.04.04").unwrap();
        assert_eq!(i.manufacturer, "RIGOL TECHNOLOGIES");
        assert_eq!(i.model, "DS1104Z");
        assert_eq!(detect_vendor(&i), Vendor::Rigol);
        assert_eq!(detect_class(Vendor::Rigol, &i), Class::Oscilloscope);
    }

    #[test]
    fn strips_leading_colon_on_tek() {
        let i = parse_idn(":TEKTRONIX,MSO54,C100123,CF:91.1CT FV:1.2.0").unwrap();
        assert_eq!(i.manufacturer, "TEKTRONIX");
        assert_eq!(detect_vendor(&i), Vendor::Tektronix);
        assert_eq!(detect_class(Vendor::Tektronix, &i), Class::Oscilloscope);
    }

    #[test]
    fn classifies_dmms() {
        let k = idn("Keysight Technologies", "34461A");
        assert_eq!(detect_vendor(&k), Vendor::Keysight);
        assert_eq!(detect_class(Vendor::Keysight, &k), Class::Dmm);

        let r = idn("Rigol Technologies", "DM3068");
        assert_eq!(detect_class(Vendor::Rigol, &r), Class::Dmm);

        let s = idn("Siglent Technologies", "SDM3065X");
        assert_eq!(detect_class(Vendor::Siglent, &s), Class::Dmm);
    }

    #[test]
    fn classifies_rigol_awg() {
        let g = idn("Rigol Technologies", "DG932");
        assert_eq!(detect_vendor(&g), Vendor::Rigol);
        assert_eq!(detect_class(Vendor::Rigol, &g), Class::Awg);
        assert_eq!(detect_class(Vendor::Rigol, &idn("Rigol", "DG812")), Class::Awg);
    }

    #[test]
    fn classifies_siglent_scope() {
        let s = idn("Siglent Technologies", "SDS1204X-E");
        assert_eq!(detect_vendor(&s), Vendor::Siglent);
        assert_eq!(detect_class(Vendor::Siglent, &s), Class::Oscilloscope);
    }

    #[test]
    fn empty_idn_is_error() {
        assert!(parse_idn("   ").is_err());
    }
}
