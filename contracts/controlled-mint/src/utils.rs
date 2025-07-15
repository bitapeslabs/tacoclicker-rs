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
pub fn get_byte_array_from_inputs(inputs: &Vec<u128>) -> Vec<u8> {
    let mut mutable_inputs = inputs.clone();

    mutable_inputs.remove(0);

    mutable_inputs
        .iter()
        .flat_map(|&num| num.to_le_bytes()) // or .to_be_bytes() for big-endian
        .collect()
}
