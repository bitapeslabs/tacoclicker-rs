//! Taco clicker tortilla contract
//!
//! Created by mork1e

pub mod consts;
pub mod token;
pub mod utils;

use alkanes_runtime::storage::StoragePointer;
use alkanes_runtime::{declare_alkane, message::MessageDispatch, runtime::AlkaneResponder};
use alkanes_support::context::Context;
use alkanes_support::id::AlkaneId;
use alkanes_support::response::CallResponse;
use anyhow::{anyhow, ensure, Result};
use bitcoin::Transaction;

use metashrew_support::compat::to_arraybuffer_layout;
use metashrew_support::index_pointer::KeyValuePointer;

use consts::{FUNDING_ADDRESS, FUNDING_PRICE_SATS};
use metashrew_support::utils::consensus_decode;
use token::MintableToken;
use utils::address_from_txout;

#[derive(Default)]
pub struct Tortilla(());

impl MintableToken for Tortilla {}

#[derive(MessageDispatch)]
enum TortillaMessage {
    #[opcode(0)]
    Initialize {
        /// Initial token units
        token_units: u128,
    },

    #[opcode(77)]
    MintTokens,

    //80-98 are reserved for tortilla specific opcodes
    #[opcode(78)]
    Register, //Check that theres a vout paying FUNDING_ADDRESS 21,000 sats and register user

    #[opcode(79)]
    #[returns(bool)]
    GetIsRegistered,

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

    #[opcode(1000)]
    #[returns(Vec<u8>)]
    GetData,
}

impl Tortilla {
    //=====  STORAGE POINTER DEFS =====
    fn get_caller_registration_pointer(&self, alkane_id: &AlkaneId) -> StoragePointer {
        let caller: Vec<u8> = alkane_id.into();
        StoragePointer::from_keyword("/registrations").select(&caller)
    }

    fn get_is_registered_value(&self, context: Context) -> Vec<u8> {
        let registration_pointer = self.get_caller_registration_pointer(&context.caller);

        registration_pointer.get().to_vec()
    }

    //==================================

    //===== chain helpers =====
    fn get_serialized_transaction(&self) -> Result<Transaction> {
        let tx = consensus_decode::<Transaction>(&mut std::io::Cursor::new(self.transaction()))
            .map_err(|_| anyhow!("TORTILLA: Failed to decode transaction"))?;
        Ok(tx)
    }
    //==================================

    fn initialize(&self, token_units: u128) -> Result<CallResponse> {
        let context = self.context()?;
        let mut response = CallResponse::forward(&context.incoming_alkanes);

        // Prevent multiple initializations
        self.observe_initialization()
            .map_err(|_| anyhow!("Contract already initialized"))?;

        // Mint initial tokens
        if token_units > 0 {
            response.alkanes.0.push(self.mint(&context, token_units)?);
        }

        Ok(response)
    }

    fn get_is_registered(&self) -> Result<CallResponse> {
        let context = self.context()?;
        let mut response = CallResponse::forward(&context.incoming_alkanes);

        response.data = self.get_is_registered_value(context);
        Ok(response)
    }

    fn register(&self) -> Result<CallResponse> {
        let context = self.context()?;
        let response = CallResponse::forward(&context.incoming_alkanes);

        let mut registration_pointer = self.get_caller_registration_pointer(&context.caller);

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
            self.get_is_registered_value(context)
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

    // ========================================================
}

impl AlkaneResponder for Tortilla {}

// Use the MessageDispatch macro for opcode handling
declare_alkane! {
    impl AlkaneResponder for Tortilla {
        type Message = TortillaMessage;
    }
}
