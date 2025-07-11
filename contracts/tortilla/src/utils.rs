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

pub fn get_inputs_from_byte_array(bytes: &Vec<u8>) -> Vec<u128> {
    assert!(
        bytes.len() % 16 == 0,
        "byte array length must be a multiple of 16 (size of u128)"
    );

    bytes
        .chunks_exact(16)
        .map(|chunk| {
            let mut buf = [0u8; 16];
            buf.copy_from_slice(chunk);
            u128::from_le_bytes(buf)
        })
        .collect()
}

//Does not consume inputs so context retains control
pub fn get_byte_array_from_inputs(inputs: &[u128]) -> Vec<u8> {
    // skip(1) leaves the original Vec untouched and avoids an O(n) remove
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
