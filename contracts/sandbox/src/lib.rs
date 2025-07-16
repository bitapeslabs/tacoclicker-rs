//! Taco clicker tortilla contract
//!
//! Created by mork1e

pub mod consts;
pub mod schemas;
pub mod token;
pub mod utils;

use alkanes_runtime::{declare_alkane, message::MessageDispatch, runtime::AlkaneResponder};
use alkanes_support::response::CallResponse;
use anyhow::{anyhow, Result};
use bitcoin::Transaction;
use borsh::{to_vec, BorshDeserialize};
use metashrew_support::compat::to_arraybuffer_layout;
use metashrew_support::utils::consensus_decode;
use schemas::{BorshWordCountInscribeRequest, BorshWordCountRequest, BorshWordCountResponse};
use std::io::Cursor;

use token::MintableToken;

use utils::{extract_witness_payload, get_byte_array_from_inputs};

#[derive(Default)]
pub struct Taqueria(());

impl Taqueria {
    fn get_serialized_transaction(&self) -> Result<Transaction> {
        let tx = consensus_decode::<Transaction>(&mut std::io::Cursor::new(self.transaction()))
            .map_err(|_| anyhow!("TORTILLA: Failed to decode transaction"))?;
        Ok(tx)
    }
}

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

    #[opcode(105)]
    #[returns(DecodableString)]
    Echo,

    #[opcode(106)]
    #[returns(Vec<u8>)]
    GetWordCount,

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

    fn echo(&self) -> Result<CallResponse> {
        let context = self.context()?;

        let mut response = CallResponse::forward(&context.incoming_alkanes);

        let inputs = self.context()?.inputs;

        response.data = get_byte_array_from_inputs(&inputs);

        Ok(response)
    }

    fn get_word_count(&self) -> Result<CallResponse> {
        let context = self.context()?;
        let mut response = CallResponse::forward(&context.incoming_alkanes);
        let inputs = self.context()?.inputs;

        let mut bytes_reader = Cursor::new(get_byte_array_from_inputs(&inputs));
        let request = BorshWordCountRequest::deserialize_reader(&mut bytes_reader)
            .map_err(|_| anyhow!("TAQUERIA: invalid request"))?;

        let word_count: u16 = u16::try_from(request.data.split_whitespace().count())
            .map_err(|_| anyhow!("TAQUERIA: Word overflow"))?;

        let tx = self
            .get_serialized_transaction()
            .map_err(|_| anyhow!("TAQUERIA: Failed to decode tx"))?;

        let witness_payload = match extract_witness_payload(&tx) {
            Some(bytes) => bytes,
            None => return Err(anyhow!("TAQUERIA: Failed to decode tx")),
        };

        let mut witness_bytes_reader = Cursor::new(&witness_payload);
        let witness_request =
            BorshWordCountInscribeRequest::deserialize_reader(&mut witness_bytes_reader)
                .map_err(|_| anyhow!("TAQUERIA: invalid witness request"))?;

        let word_count_witness: u16 =
            u16::try_from(witness_request.inscribe.split_whitespace().count())
                .map_err(|_| anyhow!("TAQUERIA: Word overflow"))?;

        let borsh_response = to_vec(&BorshWordCountResponse {
            inscribe_count: word_count_witness,
            inscribe_echo: witness_request.inscribe,
            calldata_echo: request.data,
            calldata_count: word_count,
        })
        .map_err(|_| anyhow!("TAQUERIA: Word overflow"))?;

        response.data = borsh_response;

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
