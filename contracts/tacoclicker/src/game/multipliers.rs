use anyhow::{Context, Result};
use sha2::{Digest, Sha256};

const TWO64: u128 = 1u128 << 64;
const SCALE: u128 = 100_000_000;
const CAP: u128 = 10_000;
const CAP_SCALED: u128 = CAP * SCALE;

pub fn multiplier_from_seed(seed: &[u8]) -> Result<u128> {
    // 1. SHA‑256(seed)
    let digest = Sha256::digest(seed);
    let x = u64::from_be_bytes(
        digest[0..8]
            .try_into()
            .context("TORTILLA: failed to unwrap multiplier into u128")?,
    ) as u128; // 0 ≤ x < 2⁶⁴

    if x == 0 {
        return Ok(SCALE); // exactly 1.00000000
    }

    let denom = TWO64 - x; // never 0
    let num = TWO64 * SCALE; // fits in u128 (≈1.8×10³⁰)
    let m = num / denom; // integer division

    Ok(m.min(CAP_SCALED))
}

pub fn apply_multiplier(value: u128, seed: &[u8]) -> Result<u128> {
    let m = multiplier_from_seed(seed)?; // already scaled by 1e8

    let q = value / SCALE;
    let r = value % SCALE;

    let part1 = q.saturating_mul(m); // q ≤ 2¹⁰², m ≤ 1e12 => fits 128 but saturate for safety
    let part2 = r.saturating_mul(m) / SCALE; // r < SCALE so product < 1e20 < 2⁶⁷

    Ok(part1.saturating_add(part2)) // final result in fixed‑point
}
