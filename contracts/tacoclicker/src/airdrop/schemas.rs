use borsh::{BorshDeserialize, BorshSerialize};

#[derive(BorshSerialize, BorshDeserialize, PartialEq, Debug)]
pub struct SchemaMerkleProof {
    pub leaf: Vec<u8>,
    pub proofs: Vec<Vec<u8>>,
}

#[derive(BorshSerialize, BorshDeserialize, PartialEq, Debug)]
pub struct SchemaMerkleLeaf {
    pub address: String,
    pub amount: u128,
}
