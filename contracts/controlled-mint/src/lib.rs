//! Controlled mint contract
//!
//! Created by mork1e

pub mod schemas;
pub mod token;
pub mod utils;

use alkanes_runtime::{
    declare_alkane, message::MessageDispatch, runtime::AlkaneResponder, storage::StoragePointer,
};
use alkanes_support::context::Context;
use alkanes_support::response::CallResponse;
use anyhow::{anyhow, ensure, Result};

use borsh::BorshDeserialize;
use metashrew_support::{compat::to_arraybuffer_layout, index_pointer::KeyValuePointer};

use token::MintableToken;

use std::io::Cursor;
use std::sync::Arc;

use crate::{
    schemas::{SchemaAlkaneId, SchemaControlledMintInitializationParameters},
    utils::get_byte_array_from_inputs,
};

#[derive(Default)]
pub struct ControlledMint(());

impl MintableToken for ControlledMint {}

//STORAGE GETTERS FOR TAQUERIA
impl ControlledMint {
    fn get_owner_pointer(&self) -> StoragePointer {
        StoragePointer::from_keyword("/owner")
    }

    fn get_owner_id(&self) -> Result<SchemaAlkaneId> {
        let owner = (*self.get_owner_pointer().get()).clone();
        let mut byte_reader = Cursor::new(&owner);
        let alkane_id = SchemaAlkaneId::deserialize_reader(&mut byte_reader)
            .map_err(|_| anyhow!("TORTILLA: Failed to decode owner at get_owner_id"))?;
        Ok(alkane_id)
    }

    fn assert_owner(&self, context: &Context) -> Result<()> {
        let owner = self.get_owner_id()?;

        ensure!(
            context.caller.block == owner.block.into() && context.caller.tx == owner.tx.into(),
            "TORTILLA: Caller is not the owner"
        );

        Ok(())
    }
}

#[derive(MessageDispatch)]
enum ControlledMintMessage {
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
    GetOwner,

    #[opcode(106)]
    MintExact { amount: u128 },

    #[opcode(107)]
    RenounceOwnership,

    #[opcode(1000)]
    #[returns(Vec<u8>)]
    GetData,
}

impl ControlledMint {
    fn initialize(&self) -> Result<CallResponse> {
        // Prevent multiple initializations
        self.observe_initialization()
            .map_err(|_| anyhow!("Contract already initialized"))?;

        let context = self.context()?;
        let mut response = CallResponse::forward(&context.incoming_alkanes);

        let mut byte_reader = Cursor::new(get_byte_array_from_inputs(&context.inputs));

        let consts =
            SchemaControlledMintInitializationParameters::deserialize_reader(&mut byte_reader)
                .map_err(|_| anyhow!("TORTILLA: Failed to decode initialization parameters"))?;

        self.get_owner_pointer()
            .set(Arc::new(borsh::to_vec(&SchemaAlkaneId {
                block: context.caller.block.try_into()?,
                tx: context.caller.tx.try_into()?,
            })?));
        let consumed_bytes = borsh::to_vec(&consts)?;

        self.get_consts_pointer().set(Arc::new(consumed_bytes));

        // Mint initial tokens
        response
            .alkanes
            .0
            .push(self.mint(&context, consts.premine)?);

        Ok(response)
    }

    pub fn get_owner(&self) -> Result<CallResponse> {
        let context = self.context()?;
        let mut response = CallResponse::forward(&context.incoming_alkanes);

        //Bytes are of type SchemaAlkaneID
        response.data = (*self.get_owner_pointer().get()).clone();

        Ok(response)
    }

    pub fn mint_exact(&self, amount: u128) -> Result<CallResponse> {
        let context = self.context()?;
        self.assert_owner(&context)?;

        let mut response = CallResponse::forward(&context.incoming_alkanes);

        response.alkanes.0.push(self.mint(&context, amount)?);

        Ok(response)
    }

    pub fn renounce_ownership(&self) -> Result<CallResponse> {
        let context = self.context()?;
        self.assert_owner(&context)?;
        let response = CallResponse::forward(&context.incoming_alkanes);

        //Set to a valid id so we dont get decode failures on future asserts after renouncing
        let null_owner = SchemaAlkaneId {
            block: 0u32,
            tx: 0u64,
        };

        let null_owner_bytes = borsh::to_vec(&null_owner)?;

        self.get_owner_pointer().set(Arc::new(null_owner_bytes));
        Ok(response)
    }
}

impl AlkaneResponder for ControlledMint {}

// Use the MessageDispatch macro for opcode handling
declare_alkane! {
    impl AlkaneResponder for ControlledMint {
        type Message = ControlledMintMessage;
    }
}
