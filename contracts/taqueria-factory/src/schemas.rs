use borsh::{BorshDeserialize, BorshSerialize};

#[derive(BorshSerialize, BorshDeserialize, PartialEq, Debug)]
pub struct BorshWordCountRequest {
    pub data: String,
}
#[derive(BorshSerialize, BorshDeserialize, PartialEq, Debug)]
pub struct BorshWordCountResponse {
    pub data: String,
    pub count: u16,
}
