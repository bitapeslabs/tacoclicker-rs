//! Taco clicker tortilla contract
//!
//! Created by mork1e

pub mod consts;
pub mod schemas;
pub mod token;
pub mod utils;

use alkanes_runtime::storage::StoragePointer;
use alkanes_runtime::{declare_alkane, message::MessageDispatch, runtime::AlkaneResponder};
use alkanes_support::response::CallResponse;
use anyhow::{anyhow, ensure, Result};
use bitcoin::Transaction;

use borsh::{BorshDeserialize, BorshSerialize};
use consts::{FUNDING_ADDRESS, FUNDING_PRICE_SATS};
use metashrew_support::compat::to_arraybuffer_layout;
use metashrew_support::index_pointer::KeyValuePointer;
use metashrew_support::utils::consensus_decode;
use std::io::Cursor;
use std::sync::Arc;
use token::MintableToken;

use crate::schemas::SchemaTortillaConsts;
use crate::utils::get_byte_array_from_inputs;

#[derive(Default)]
pub struct Tortilla(());

impl MintableToken for Tortilla {}

//STORAGE TORTILLA
impl Tortilla {
    fn get_consts_pointer(&self) -> StoragePointer {
        StoragePointer::from_keyword("/consts")
    }

    fn get_consts_value(&self) -> Result<SchemaTortillaConsts> {
        let bytes = (*self.get_consts_pointer().get()).clone();
        let mut bytes_reader = Cursor::new(&bytes);

        SchemaTortillaConsts::deserialize_reader(&mut bytes_reader)
            .map_err(|_| anyhow!("TORTILLA: Failed to deserialize consts"))
    }

    fn get_caller_registration_pointer(&self, vout: usize) -> Result<StoragePointer> {
        let caller_vout_id = self.get_caller_id_at_vout(vout)?;
        Ok(StoragePointer::from_keyword("/registrations").select(&caller_vout_id))
    }

    fn get_caller_id_at_vout(&self, vout: usize) -> Result<Vec<u8>> {
        let tx = self.get_serialized_transaction()?;

        match tx.output.get(vout) {
            Some(output) => Ok(output.script_pubkey.as_bytes().to_vec()),
            None => Err(anyhow!("TORTILLA: invalid script pub key at vout")),
        }
    }

    fn get_is_registered_value(&self, vout: usize) -> Result<Vec<u8>> {
        let registration_pointer = self.get_caller_registration_pointer(vout)?;

        Ok(registration_pointer.get().to_vec())
    }
}

#[derive(MessageDispatch)]
enum TortillaMessage {
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

    //TORTILLA OPCODES START HERE
    #[opcode(105)]
    #[returns(Vec<u8>)]
    GetConsts,

    #[opcode(1000)]
    #[returns(Vec<u8>)]
    GetData,
}

impl Tortilla {
    //=====  STORAGE POINTER DEFS =====

    //==================================

    //===== chain helpers =====
    fn get_serialized_transaction(&self) -> Result<Transaction> {
        let tx = consensus_decode::<Transaction>(&mut std::io::Cursor::new(self.transaction()))
            .map_err(|_| anyhow!("TORTILLA: Failed to decode transaction"))?;
        Ok(tx)
    }
    //==================================

    fn initialize(&self) -> Result<CallResponse> {
        // Prevent multiple initializations
        self.observe_initialization()
            .map_err(|_| anyhow!("Contract already initialized"))?;

        let context = self.context()?;
        let response = CallResponse::forward(&context.incoming_alkanes);

        let mut byte_reader = Cursor::new(get_byte_array_from_inputs(&context.inputs));
        let consts = SchemaTortillaConsts::deserialize_reader(&mut byte_reader)
            .map_err(|_| anyhow!("TORTILLA: Failed to decode initialization parameters"))?;

        let consumed_bytes = borsh::to_vec(&consts)?;
        self.get_consts_pointer().set(Arc::new(consumed_bytes));

        Ok(response)
    }

    fn get_consts(&self) -> Result<CallResponse> {
        let context = self.context()?;
        let mut response = CallResponse::forward(&context.incoming_alkanes);

        response.data = (*self.get_consts_pointer().get()).clone();

        Ok(response)
    }

    /*
    fn get_is_registered(&self, vout: u128) -> Result<CallResponse> {
        let context = self.context()?;
        let mut response = CallResponse::forward(&context.incoming_alkanes);

        response.data = self.get_is_registered_value(
            vout.try_into()
                .map_err(|_| anyhow!("TORTILLA: failed to unwrap vout into usize"))?,
        )?;
        Ok(response)
    }

    // The scriptpubkey @ 'vout' will be granted access
    // methods that should only be called by 'vout' will check if the sig of any vin was signed by the registered 'vout' scriptpubkey
    // This gives us account based functionality, in a utxo based environment.
    fn register(&self, vout: u128) -> Result<CallResponse> {
        let safe_vout: usize = vout
            .try_into()
            .map_err(|_| anyhow!("TORTILLA: failed to unwrap vout into usize"))?;

        let context = self.context()?;
        let response = CallResponse::forward(&context.incoming_alkanes);

        let mut registration_pointer = self.get_caller_registration_pointer(safe_vout)?;

        let tx = self.get_serialized_transaction()?;

        let total_value_to_funding: u64 = tx
            .output
            .iter()
            .filter(|o| address_from_txout(o) == FUNDING_ADDRESS)
            .map(|o| o.value.to_sat())
            .sum();

        ensure!(
            total_value_to_funding >= FUNDING_PRICE_SATS,
            "TORTILLA: for register (opcode 78) the parent tx must send {} sats to funding address {}",
            FUNDING_PRICE_SATS,
            FUNDING_ADDRESS
        );

        let is_registered = u8::from_le_bytes(
            self.get_is_registered_value(safe_vout)?
                .try_into()
                .map_err(|_| anyhow!("TORTILLA: invalid u128 at /registered"))?,
        );

        ensure!(
            is_registered != 1,
            "TORTILLA: this caller is already registered"
        );

        //1= registered. 0=not registered
        registration_pointer.set_value(1 as u8);

        Ok(response)
    }
     */

    // ========================================================
}

impl AlkaneResponder for Tortilla {}

// Use the MessageDispatch macro for opcode handling
declare_alkane! {
    impl AlkaneResponder for Tortilla {
        type Message = TortillaMessage;
    }
}
