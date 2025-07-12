//! Taco clicker tortilla contract
//!
//! Created by mork1e

pub mod consts;
pub mod schemas;
pub mod token;
pub mod utils;

use alkanes_runtime::{
    declare_alkane, message::MessageDispatch, runtime::AlkaneResponder, storage::StoragePointer,
};
use alkanes_support::response::CallResponse;
use anyhow::{anyhow, Result};

use borsh::{BorshDeserialize, BorshSerialize};
use metashrew_support::{compat::to_arraybuffer_layout, index_pointer::KeyValuePointer};
use std::io::Cursor;

use token::MintableToken;

use std::sync::Arc;
use utils::get_byte_array_from_inputs;

use crate::schemas::{SchemaAlkaneId, SchemaTortillaConsts};

#[derive(Default)]
pub struct Taqueria(());

impl MintableToken for Taqueria {}

//STORAGE GETTERS FOR TAQUERIA
impl Taqueria {
    fn get_tortilla_id_pointer(&self) -> StoragePointer {
        StoragePointer::from_keyword("/tortilla")
    }
}

#[derive(MessageDispatch)]
enum TaqueriaMessage {
    #[opcode(0)]
    Initialize,

    #[opcode(77)]
    MintTokens,

    #[opcode(99)]
    #[returns(String)]
    GetName,

    #[opcode(100)]
    #[returns(String)]
    GetSymbol,

    #[opcode(101)]
    #[returns(u128)]
    GetTotalSupply,

    #[opcode(102)]
    #[returns(u128)]
    GetCap,

    #[opcode(103)]
    #[returns(u128)]
    GetMinted,

    #[opcode(104)]
    #[returns(u128)]
    GetValuePerMint,

    //TAQUERIA FUNCTIONS START HERE
    #[opcode(105)]
    #[returns(u128)]
    GetTortillaId,

    #[opcode(1000)]
    #[returns(Vec<u8>)]
    GetData,
}

impl Taqueria {
    fn initialize(&self) -> Result<CallResponse> {
        // Prevent multiple initializations
        self.observe_initialization()
            .map_err(|_| anyhow!("Contract already initialized"))?;

        let context = self.context()?;
        let mut response = CallResponse::forward(&context.incoming_alkanes);

        self.get_tortilla_id_pointer()
            .set(Arc::new(borsh::to_vec(&SchemaAlkaneId {
                block: context.caller.block.try_into()?,
                tx: context.caller.tx.try_into()?,
            })?));

        // Mint initial tokens
        response.alkanes.0.push(self.mint(&context, 1u128)?);

        Ok(response)
    }

    pub fn get_tortilla_id(&self) -> Result<CallResponse> {
        let context = self.context()?;
        let mut response = CallResponse::forward(&context.incoming_alkanes);

        //Bytes are of type SchemaAlkaneID
        response.data = (*self.get_tortilla_id_pointer().get()).clone();

        Ok(response)
    }
}

impl AlkaneResponder for Taqueria {}

// Use the MessageDispatch macro for opcode handling
declare_alkane! {
    impl AlkaneResponder for Taqueria {
        type Message = TaqueriaMessage;
    }
}
