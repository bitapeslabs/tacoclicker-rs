use alkanes_support::id::AlkaneId;
use borsh::{BorshDeserialize, BorshSerialize};
/*
    Schema alkaneid uses u32's which have a max value of 4b. This fits well into the constrains of BTC (for block and sequence value)
    Uses something like u128 in storage is very wasteful. Tx uses a u64 because the sequence pointer CAN eventually overflow 4b, but
    for block which is literally just "2" on alkanes, there is no reason for this to be a u128. Infact i might make this a u8 lol.
    nvm flex told me its not guaranteed to always be inside a u8 cuz of runes, but u32 is a safe assumption.
*/
#[derive(BorshSerialize, BorshDeserialize, PartialEq, Debug, Clone, Copy)]
pub struct SchemaAlkaneId {
    pub block: u32,
    pub tx: u64,
}

#[derive(BorshSerialize, BorshDeserialize, PartialEq, Debug)]
pub struct SchemaTacoClickerInitializationParameters {
    pub controlled_mint_factory: SchemaAlkaneId,
    pub merkle_distributor_factory: SchemaAlkaneId,
    pub merkle_root_id: u8,
}

#[derive(BorshSerialize, BorshDeserialize, PartialEq, Debug)]
pub struct SchemaTacoClickerConsts {
    pub controlled_mint_factory: SchemaAlkaneId,
    pub tortilla_alkane_id: SchemaAlkaneId,
    pub merkle_distributor_alkane_id: SchemaAlkaneId,
}

#[derive(BorshSerialize, BorshDeserialize, PartialEq, Debug)]
pub struct SchemaAlkaneList {
    pub alkanes: Vec<SchemaAlkaneId>,
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
pub struct SchemaControlledMintInitializationParameters {
    pub token_name: String,
    pub token_symbol: String,
    pub premine: u128,
    pub cap: u128,
}
#[derive(BorshSerialize, BorshDeserialize, PartialEq, Debug)]
pub struct SchemaInitializeMerkleDistributorParameters {
    pub merkle_root: Vec<u8>,
    pub alkane_id: SchemaAlkaneId,
    pub amount: u128,
    pub block_end: u128,
}
