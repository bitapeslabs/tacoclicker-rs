use borsh::{BorshDeserialize, BorshSerialize};

#[derive(BorshSerialize, BorshDeserialize, PartialEq, Debug)]
pub struct SchemaAlkaneId {
    pub block: u32,
    pub tx: u32,
}

#[derive(BorshSerialize, BorshDeserialize, PartialEq, Debug)]
pub struct SchemaTortillaConsts {
    pub taqueria_factory_alkane_id: SchemaAlkaneId,
    pub salsa_alkane_id: SchemaAlkaneId,
}
