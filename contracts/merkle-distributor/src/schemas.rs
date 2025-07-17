use alkanes_support::id::AlkaneId;
use borsh::{BorshDeserialize, BorshSerialize};

#[derive(BorshSerialize, BorshDeserialize, PartialEq, Debug, Clone, Copy)]
pub struct SchemaAlkaneId {
    pub block: u32,
    pub tx: u64,
}

#[derive(BorshSerialize, BorshDeserialize, PartialEq, Debug)]
pub struct SchemaInitializeMerkleDistributorParameters {
    pub merkle_root: Vec<u8>,
    pub alkane_id: SchemaAlkaneId,
    pub amount: u128,
    pub block_end: u128,
}
impl From<SchemaAlkaneId> for AlkaneId {
    fn from(value: SchemaAlkaneId) -> Self {
        AlkaneId {
            block: value.block.into(),
            tx: value.tx.into(),
        }
    }
}

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
