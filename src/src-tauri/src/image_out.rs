//! Indexed (PLTE) PNG writing, for the "Reduced Color" capture option.
//!
//! This goes straight to the `png` crate rather than through `image`, because
//! `image` 0.25 cannot write a palette: its PNG encoder whitelists only
//! L8/La8/Rgb8/Rgba8 and the 16-bit variants, and `ExtendedColorType::Unknown`,
//! the one variant documented for palette data, falls through to an error.
//!
//! The indexed form is the whole point of the feature. Writing the reduced
//! pixels back as 24-bit PNG makes the file *larger* than the original, because
//! the dither noise defeats the compressor. Verified against a real Rigol
//! DS1104Z: the scope sends a 41598-byte truecolor PNG, and the same screen
//! reduced to 64 colours and written here is 16774 bytes, 40% of it, which also
//! beats ImageMagick's PNG8 on identical pixels (17842 B).
//!
//! Decoding is not a concern anywhere else in the app: `image::load_from_memory`
//! expands a palette to RGB on read, so the clipboard and preview paths keep
//! working on these bytes unchanged.

use crate::error::{AppError, AppResult};

/// Largest palette an indexed PNG can carry.
const MAX_PALETTE: usize = 256;

/// Smallest PNG bit depth that can address `colors` palette entries.
///
/// PNG allows 1, 2, 4 and 8 bits for indexed images, so a small palette does
/// not need a whole byte per pixel. This is lossless: the same pixels and the
/// same palette, just packed tighter before deflate. Measured on a real Rigol
/// DS1104Z capture (800x480), against the same data at 8 bits:
///   2 colours   1 bit    24-37% smaller
///   4 colours   2 bits   22-23% smaller
///   8 colours   4 bits   10-12% smaller
///   16 colours  4 bits    8-9% smaller
/// Above 16 there is nothing to win, since 5 bits is not a legal depth.
fn min_bit_depth(colors: usize) -> u8 {
    match colors {
        0..=2 => 1,
        3..=4 => 2,
        5..=16 => 4,
        _ => 8,
    }
}

/// Pack one-byte indices down to `bits` per pixel.
///
/// PNG fills each byte left to right, most significant bits first, and pads
/// every row to a byte boundary (rows are independent, so the padding cannot be
/// shared between them).
fn pack_indices(indices: &[u8], width: u32, height: u32, bits: u8) -> Vec<u8> {
    debug_assert!(matches!(bits, 1 | 2 | 4));
    let per_byte = (8 / bits) as usize;
    let row_bytes = (width as usize).div_ceil(per_byte);
    let w = width as usize;
    let mut out = vec![0u8; row_bytes * height as usize];
    for y in 0..height as usize {
        let src = y * w;
        let dst = y * row_bytes;
        for x in 0..w {
            let shift = 8 - bits as usize * (x % per_byte + 1);
            out[dst + x / per_byte] |= indices[src + x] << shift;
        }
    }
    out
}

/// Encode palette indices plus an interleaved RGB palette as an 8-bit indexed PNG.
///
/// `indices` is one byte per pixel in row-major order, `palette` is `count * 3`
/// bytes of RGB. Both come from the reducer in the webview.
pub fn encode_indexed_png(
    indices: &[u8],
    palette: &[u8],
    width: u32,
    height: u32,
) -> AppResult<Vec<u8>> {
    if width == 0 || height == 0 {
        return Err(AppError::Image(format!("degenerate size {width}x{height}")));
    }
    if palette.is_empty() || palette.len() % 3 != 0 {
        return Err(AppError::Image(format!(
            "palette length {} is not a non-zero multiple of 3",
            palette.len()
        )));
    }
    let colors = palette.len() / 3;
    if colors > MAX_PALETTE {
        return Err(AppError::Image(format!(
            "palette has {colors} entries, more than the {MAX_PALETTE} an indexed PNG allows"
        )));
    }

    let expected = (width as usize)
        .checked_mul(height as usize)
        .ok_or_else(|| AppError::Image(format!("size {width}x{height} overflows")))?;
    if indices.len() != expected {
        return Err(AppError::Image(format!(
            "got {} indices for a {width}x{height} image, expected {expected}",
            indices.len()
        )));
    }

    // An out-of-range index would produce a file that renders differently
    // depending on the decoder, so reject it rather than write it.
    if let Some(&bad) = indices.iter().find(|&&i| (i as usize) >= colors) {
        return Err(AppError::Image(format!(
            "index {bad} is outside the {colors}-entry palette"
        )));
    }

    // Pack to the narrowest legal depth. Lossless, and worth up to 37% on small
    // palettes; a no-op above 16 colours.
    let bits = min_bit_depth(colors);
    let packed = if bits == 8 {
        None
    } else {
        Some(pack_indices(indices, width, height, bits))
    };
    let rows = packed.as_deref().unwrap_or(indices);

    let mut out = Vec::new();
    {
        let mut encoder = png::Encoder::new(&mut out, width, height);
        encoder.set_color(png::ColorType::Indexed);
        encoder.set_depth(match bits {
            1 => png::BitDepth::One,
            2 => png::BitDepth::Two,
            4 => png::BitDepth::Four,
            _ => png::BitDepth::Eight,
        });
        encoder.set_palette(palette.to_vec());
        // ORDER IS LOAD-BEARING. `set_compression` calls `set_filter` internally
        // (encoder.rs:303, `self.set_filter(Filter::from_simple(compression))`),
        // so setting the filter first has it silently overwritten. Getting this
        // backwards is not a compile error and not a runtime error; it just
        // quietly costs 19% of the file, and it makes every filter setting look
        // identical, which is exactly how it hid here for a while.
        // Measured on the same capture, with the order correct:
        //   Balanced  17349 B   21 ms
        //   High      16774 B   51 ms   <- this
        // 30 ms is invisible next to the SCPI transfer and the reduction itself
        // (hundreds of ms), and file size is the entire point of the feature.
        encoder.set_compression(png::Compression::High);
        // Palette indices are labels, not samples, so byte-delta filters have
        // nothing to predict and only add entropy. Measured on a real Rigol
        // DS1104Z capture (800x480, flat UI, reduced to 64 colours):
        //   NoFilter    17349 B   <- this
        //   MinEntropy  20300 B
        //   Up          20239 B
        //   Sub         20241 B
        //   Paeth       20346 B
        //   Adaptive    20570 B   (what `set_compression` would have left)
        // ImageMagick's PNG8 writes the same pixels in 17842 B, also unfiltered.
        encoder.set_filter(png::Filter::NoFilter);
        let mut writer = encoder
            .write_header()
            .map_err(|e| AppError::Image(format!("writing PNG header: {e}")))?;
        writer
            .write_image_data(rows)
            .map_err(|e| AppError::Image(format!("writing PNG image data: {e}")))?;
        writer
            .finish()
            .map_err(|e| AppError::Image(format!("finishing PNG: {e}")))?;
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encodes_a_minimal_indexed_png() {
        // 2x2, two colours, indices referencing both
        let indices = [0u8, 1, 1, 0];
        let palette = [255u8, 0, 0, 0, 0, 255];
        let png = encode_indexed_png(&indices, &palette, 2, 2).expect("encode");
        assert_eq!(&png[..8], b"\x89PNG\r\n\x1a\n", "PNG signature");
        // PLTE must be present, which is the entire point
        assert!(
            png.windows(4).any(|w| w == b"PLTE"),
            "expected a PLTE chunk in the output"
        );
    }

    #[test]
    fn round_trips_through_the_image_crate() {
        let indices = [0u8, 1, 1, 0];
        let palette = [255u8, 0, 0, 0, 0, 255];
        let png = encode_indexed_png(&indices, &palette, 2, 2).expect("encode");
        // The clipboard and preview paths decode with `image`; assert that a
        // palette PNG survives that, since those paths are left untouched.
        let decoded = image::load_from_memory(&png).expect("decode with image crate");
        let rgb = decoded.to_rgb8();
        assert_eq!(rgb.dimensions(), (2, 2));
        assert_eq!(rgb.get_pixel(0, 0).0, [255, 0, 0]);
        assert_eq!(rgb.get_pixel(1, 0).0, [0, 0, 255]);
    }

    /// Deterministic indexed image whose rows are filter-hostile.
    fn sample(w: u32, h: u32, colors: u8) -> (Vec<u8>, Vec<u8>) {
        let mut indices = Vec::with_capacity((w * h) as usize);
        for y in 0..h {
            for x in 0..w {
                indices.push(((x * 7 + y * 13) % colors as u32) as u8);
            }
        }
        let mut palette = Vec::with_capacity(colors as usize * 3);
        for i in 0..colors {
            palette.extend_from_slice(&[i.wrapping_mul(7), 255 - i, i.wrapping_mul(3)]);
        }
        (indices, palette)
    }

    /// Guards the call order in `encode_indexed_png`.
    ///
    /// `set_compression` overwrites the filter, so writing the two calls the
    /// wrong way round leaves adaptive filtering on. That is invisible: it still
    /// produces a valid PNG, just a materially bigger one. This asserts we come
    /// out smaller than the adaptively-filtered encoding of identical data,
    /// which can only hold if our rows are genuinely unfiltered.
    #[test]
    fn does_not_filter_palette_rows() {
        let (w, h) = (128u32, 128u32);
        let (indices, palette) = sample(w, h, 32);

        let ours = encode_indexed_png(&indices, &palette, w, h).expect("encode");

        let mut filtered = Vec::new();
        {
            let mut e = png::Encoder::new(std::io::Cursor::new(&mut filtered), w, h);
            e.set_color(png::ColorType::Indexed);
            e.set_depth(png::BitDepth::Eight);
            e.set_palette(palette.clone());
            e.set_compression(png::Compression::Balanced);
            e.set_filter(png::Filter::Adaptive);
            let mut wr = e.write_header().unwrap();
            wr.write_image_data(&indices).unwrap();
            wr.finish().unwrap();
        }

        assert!(
            ours.len() < filtered.len(),
            "expected unfiltered ({} B) to beat adaptive ({} B); has set_filter been \
             moved back above set_compression?",
            ours.len(),
            filtered.len()
        );
    }

    /// Sub-byte packing must be exactly reversible, and must survive the
    /// decoder the rest of the app uses. The clipboard and preview paths both go
    /// through `image::load_from_memory`, so a 1/2/4-bit file that only our
    /// encoder understands would break them.
    #[test]
    fn sub_byte_depths_round_trip_through_the_image_crate() {
        for colors in [2usize, 3, 4, 5, 16, 17, 64] {
            // odd width so the final byte of each row is partly padding
            let (w, h) = (13u32, 7u32);
            let (indices, palette) = sample(w, h, colors as u8);
            let png = encode_indexed_png(&indices, &palette, w, h)
                .unwrap_or_else(|e| panic!("{colors} colours: {e}"));

            let expected_bits = min_bit_depth(colors);
            let decoded = image::load_from_memory(&png)
                .unwrap_or_else(|e| panic!("{colors} colours at {expected_bits} bits: {e}"));
            let rgb = decoded.to_rgb8();
            assert_eq!(rgb.dimensions(), (w, h), "{colors} colours: geometry");

            for y in 0..h {
                for x in 0..w {
                    let idx = indices[(y * w + x) as usize] as usize;
                    let want = [palette[idx * 3], palette[idx * 3 + 1], palette[idx * 3 + 2]];
                    assert_eq!(
                        rgb.get_pixel(x, y).0, want,
                        "{colors} colours at {expected_bits} bits: pixel {x},{y}"
                    );
                }
            }
        }
    }

    #[test]
    fn packing_picks_the_narrowest_legal_depth() {
        assert_eq!(min_bit_depth(1), 1);
        assert_eq!(min_bit_depth(2), 1);
        assert_eq!(min_bit_depth(3), 2);
        assert_eq!(min_bit_depth(4), 2);
        assert_eq!(min_bit_depth(5), 4);
        assert_eq!(min_bit_depth(16), 4);
        // 5 bits is not a legal PNG depth, so 17..=256 all pay a full byte
        assert_eq!(min_bit_depth(17), 8);
        assert_eq!(min_bit_depth(256), 8);
    }

    #[test]
    fn packing_beats_a_full_byte_per_pixel() {
        // 16 colours over a large enough area for deflate to show the difference
        let (w, h) = (256u32, 256u32);
        let (indices, palette) = sample(w, h, 16);
        let packed = encode_indexed_png(&indices, &palette, w, h).expect("encode");

        let mut eight = Vec::new();
        {
            let mut e = png::Encoder::new(std::io::Cursor::new(&mut eight), w, h);
            e.set_color(png::ColorType::Indexed);
            e.set_depth(png::BitDepth::Eight);
            e.set_palette(palette.clone());
            e.set_compression(png::Compression::High);
            e.set_filter(png::Filter::NoFilter);
            let mut wr = e.write_header().unwrap();
            wr.write_image_data(&indices).unwrap();
            wr.finish().unwrap();
        }
        assert!(
            packed.len() < eight.len(),
            "4-bit packing ({} B) should beat 8-bit ({} B)",
            packed.len(),
            eight.len()
        );
    }

    #[test]
    fn rejects_bad_input() {
        let palette = [255u8, 0, 0, 0, 0, 255];
        // wrong index count
        assert!(encode_indexed_png(&[0, 1], &palette, 2, 2).is_err());
        // index outside the palette
        assert!(encode_indexed_png(&[0, 1, 2, 0], &palette, 2, 2).is_err());
        // palette not a multiple of 3
        assert!(encode_indexed_png(&[0, 0, 0, 0], &[1, 2], 2, 2).is_err());
        // degenerate geometry
        assert!(encode_indexed_png(&[], &palette, 0, 0).is_err());
    }

}
