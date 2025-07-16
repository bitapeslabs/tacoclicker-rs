use crate::consts::DEPLOYMENT_NETWORK;
use bitcoin::{Address, TxOut};

pub fn u128_to_string(v: u128) -> String {
    String::from_utf8(
        v.to_le_bytes()
            .into_iter()
            .fold(Vec::<u8>::new(), |mut r, v| {
                if v != 0 {
                    r.push(v)
                }
                r
            }),
    )
    .unwrap()
}

pub fn bytes_to_u128_words(bytes: &[u8]) -> Vec<u128> {
    let mut out = Vec::with_capacity((bytes.len() + 15) / 16);
    for chunk in bytes.chunks(16) {
        let mut buf = [0u8; 16];
        buf[..chunk.len()].copy_from_slice(chunk); // zero-pad
        out.push(u128::from_le_bytes(buf));
    }
    out
}
pub fn get_byte_array_from_inputs(inputs: &[u128]) -> Vec<u8> {
    inputs
        .iter()
        .skip(1)
        .flat_map(|num| num.to_le_bytes()) // still LE
        .collect()
}
pub fn address_from_txout(output: &TxOut) -> String {
    match Address::from_script(&output.script_pubkey, DEPLOYMENT_NETWORK) {
        Ok(address) => address.to_string(),
        Err(_) => String::new(),
    }
}

macro_rules! decode_from_ctx {
    ($ctx:expr, $ty:ty) => {{
        use std::io::Cursor;
        let mut rdr = Cursor::new(get_byte_array_from_inputs(&$ctx.inputs));
        <$ty>::deserialize_reader(&mut rdr)
            .map_err(|_| ::anyhow::anyhow!("TORTILLA: failed to decode {}", stringify!($ty)))
    }};
}
macro_rules! decode_from_vec {
    ($bytes:expr, $ty:ty) => {{
        use std::io::Cursor;
        // Accept anything that turns into a byte slice; `&Vec<u8>` or `&[u8]` both work.
        let mut rdr = Cursor::new(&$bytes[..]);
        <$ty>::deserialize_reader(&mut rdr)
            .map_err(|_| ::anyhow::anyhow!("TORTILLA: failed to decode {}", stringify!($ty)))
    }};
}
// Allow other modules in the same crate to `use` it:
pub(crate) use {decode_from_ctx, decode_from_vec};
