//! Taco clicker tortilla contract
//!
//! Created by mork1e

pub mod consts;
pub mod schemas;
pub mod token;
pub mod utils;

use alkanes_runtime::storage::StoragePointer;
use alkanes_runtime::{declare_alkane, message::MessageDispatch, runtime::AlkaneResponder};
use alkanes_support::cellpack::Cellpack;
use alkanes_support::id::AlkaneId;
use alkanes_support::parcel::AlkaneTransfer;
use alkanes_support::response::CallResponse;
use anyhow::{anyhow, ensure, Context, Result};
use bitcoin::Transaction;

use borsh::BorshDeserialize;
use consts::{FUNDING_ADDRESS, FUNDING_PRICE_SATS};
use metashrew_support::compat::to_arraybuffer_layout;
use metashrew_support::index_pointer::KeyValuePointer;
use metashrew_support::utils::consensus_decode;
use std::io::Cursor;
use std::sync::Arc;
use token::MintableToken;

use crate::schemas::{SchemaAlkaneId, SchemaAlkaneList, SchemaTortillaConsts};
use crate::utils::{address_from_txout, bytes_to_u128_words, get_byte_array_from_inputs};

#[derive(Default)]
pub struct Tortilla(());

impl MintableToken for Tortilla {}

//STORAGE GETTERS TORTILLA
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

    fn get_taquerias_pointer(&self, taqueria: &SchemaAlkaneId) -> Result<StoragePointer> {
        Ok(StoragePointer::from_keyword("/taquerias").select(&borsh::to_vec(taqueria)?))
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

    #[opcode(106)]
    #[returns(Vec<u8>)] //Alkane ID
    Register,

    #[opcode(107)]
    #[returns(Vec<u8>)] //First AlkaneID that corresponds to a valid taqueria
    GetTaqueriaFromAlkaneList,

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

    fn register(&self) -> Result<CallResponse> {
        let context = self
            .context()
            .context("TORTILLA: failed to fetch call context")?;

        let mut response = CallResponse::forward(&context.incoming_alkanes);

        let tx = self
            .get_serialized_transaction()
            .context("TORTILLA: failed to get serialized parent transaction")?;

        let total_value_to_funding: u64 = tx
            .output
            .iter()
            .filter(|o| address_from_txout(o) == FUNDING_ADDRESS)
            .map(|o| o.value.to_sat())
            .sum();

        ensure!(
            total_value_to_funding >= FUNDING_PRICE_SATS,
            "TORTILLA: for register, the parent tx must send {FUNDING_PRICE_SATS} sats to funding address {FUNDING_ADDRESS}"
    );

        let consts = self
            .get_consts_value()
            .context("TORTILLA: failed to fetch on-chain consts")?;

        let seq = self.sequence(); // capture once for logging
        let next_alkane = SchemaAlkaneId {
            block: 2u32,
            tx: seq
                .try_into()
                .map_err(|_| anyhow!("TORTILLA: sequence {} overflows target integer", seq))?,
        };

        let pointer_id = SchemaAlkaneId {
            block: context.myself.block.try_into().map_err(|_| {
                anyhow!(
                    "TORTILLA: context.myself.block {} does not fit into u32",
                    context.myself.block
                )
            })?,
            tx: context.myself.tx.try_into().map_err(|_| {
                anyhow!(
                    "TORTILLA: context.myself.block {} does not fit into u32",
                    context.myself.block
                )
            })?,
        };

        let pointer_bytes =
            borsh::to_vec(&pointer_id).context("TORTILLA: failed to Borsh-serialize pointer_id")?;

        let mut calldata: Vec<u128> = vec![0u128];
        calldata.extend_from_slice(&bytes_to_u128_words(&pointer_bytes));

        let cellpack = Cellpack {
            target: AlkaneId {
                block: 5u128, // clone 2,n to 2,sequence
                tx: consts.taqueria_factory_alkane_id.tx.into(),
            },
            inputs: calldata,
        };

        self.call(&cellpack, &response.alkanes, self.fuel())
            .map_err(|err| {
                anyhow!(
                    "TORTILLA: failed to clone taqueria factory @ 2,{}: {}",
                    consts.taqueria_factory_alkane_id.tx,
                    err
                )
            })?;

        self.get_taquerias_pointer(&next_alkane)
            .context("TORTILLA: could not get taqueria pointer")?
            .set_value(1u8);

        //transfer the alkane out of the initilzation contract to the main unallocated alkanes
        response.alkanes.0.push(AlkaneTransfer {
            id: AlkaneId {
                block: next_alkane.block.into(),
                tx: next_alkane.tx.into(),
            },
            value: 1u128,
        });

        response.data = borsh::to_vec(&next_alkane)
            .context("TORTILLA: failed to Borsh-serialize next_alkane")?;

        Ok(response)
    }

    fn get_taqueria_from_alkane_list(&self) -> Result<CallResponse> {
        let context = self.context()?;
        let mut response = CallResponse::forward(&context.incoming_alkanes);

        let mut byte_reader = Cursor::new(get_byte_array_from_inputs(&context.inputs));

        //Just one thing is passed to taqueria init, and that is the tortilla contract
        let alkane_list = SchemaAlkaneList::deserialize_reader(&mut byte_reader)
            .map_err(|_| anyhow!("TAQUERIA: Failed to decode parameters"))?
            .alkanes;

        let found_alkanes: Vec<SchemaAlkaneId> = alkane_list
            .iter()
            .filter_map(|taqueria| match self.get_taquerias_pointer(taqueria) {
                Ok(ptr) => {
                    if ptr.get_value::<u8>() == 1u8 {
                        Some(taqueria.clone())
                    } else {
                        None
                    }
                }
                Err(_) => None,
            })
            .collect();

        response.data = borsh::to_vec(&SchemaAlkaneList {
            alkanes: found_alkanes,
        })?;

        Ok(response)
    }
}

impl AlkaneResponder for Tortilla {}

declare_alkane! {
    impl AlkaneResponder for Tortilla {
        type Message = TortillaMessage;
    }
}
