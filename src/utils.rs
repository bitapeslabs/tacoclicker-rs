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

pub fn address_from_txout(output: &TxOut) -> String {
    match Address::from_script(&output.script_pubkey, DEPLOYMENT_NETWORK) {
        Ok(address) => address.to_string(),
        Err(_) => String::new(),
    }
}
