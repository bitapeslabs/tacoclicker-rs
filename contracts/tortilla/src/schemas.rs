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
pub struct SchemaTortillaConsts {
    pub taqueria_factory_alkane_id: SchemaAlkaneId,
    pub salsa_alkane_id: SchemaAlkaneId,
}

#[derive(BorshSerialize, BorshDeserialize, PartialEq, Debug)]
pub struct SchemaAlkaneList {
    pub alkanes: Vec<SchemaAlkaneId>,
}
