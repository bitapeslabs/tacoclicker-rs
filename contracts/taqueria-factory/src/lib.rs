//! Taco clicker tortilla contract
//!
//! Created by mork1e

pub mod consts;
pub mod token;
pub mod utils;

use alkanes_runtime::{declare_alkane, message::MessageDispatch, runtime::AlkaneResponder};
use alkanes_support::response::CallResponse;
use anyhow::{anyhow, Result};

use metashrew_support::compat::to_arraybuffer_layout;

use token::MintableToken;

#[derive(Default)]
pub struct Taqueria(());

impl MintableToken for Taqueria {}

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

    #[opcode(1000)]
    #[returns(Vec<u8>)]
    GetData,
}

impl Taqueria {
    fn initialize(&self) -> Result<CallResponse> {
        let context = self.context()?;
        let mut response = CallResponse::forward(&context.incoming_alkanes);

        // Prevent multiple initializations
        self.observe_initialization()
            .map_err(|_| anyhow!("Contract already initialized"))?;

        // Mint initial tokens
        response.alkanes.0.push(self.mint(&context, 1u128)?);

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
