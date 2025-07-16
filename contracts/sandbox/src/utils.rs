use alkanes_support::witness::find_witness_payload;
use bitcoin::Transaction;

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

//Does not consume inputs so context retains control
pub fn get_byte_array_from_inputs(inputs: &[u128]) -> Vec<u8> {
    // skip(1) leaves the original Vec untouched and avoids an O(n) remove
    inputs
        .iter()
        .skip(1)
        .flat_map(|num| num.to_le_bytes()) // still LE
        .collect()
}

pub fn extract_witness_payload(tx: &Transaction) -> Option<Vec<u8>> {
    // Try every input; Ordinals conventionally uses index 0, but
    // looping covers edge‑cases.
    for idx in 0..tx.input.len() {
        if let Some(data) = find_witness_payload(&tx, idx) {
            if !data.is_empty() {
                return Some(data);
            }
        }
    }
    None
}
