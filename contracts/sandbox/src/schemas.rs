use borsh::{BorshDeserialize, BorshSerialize};

#[derive(BorshSerialize, BorshDeserialize, PartialEq, Debug)]
pub struct BorshWordCountRequest {
    pub data: String,
}
#[derive(BorshSerialize, BorshDeserialize, PartialEq, Debug)]
pub struct BorshWordCountResponse {
    pub calldata_echo: String,
    pub inscribe_echo: String,
    pub calldata_count: u16,
    pub inscribe_count: u16,
}

#[derive(BorshSerialize, BorshDeserialize, PartialEq, Debug)]
pub struct BorshWordCountInscribeRequest {
    pub inscribe: String,
}
