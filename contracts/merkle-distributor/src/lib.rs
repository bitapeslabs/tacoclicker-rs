//! Merkle distributor contract
//!
//! Created by mork1e
pub mod consts;
pub mod schemas;
pub mod token;
pub mod utils;

use alkanes_runtime::{
    declare_alkane, message::MessageDispatch, runtime::AlkaneResponder, storage::StoragePointer,
};
use bitcoin::{Address, Transaction};

use alkanes_support::{parcel::AlkaneTransfer, response::CallResponse};
use anyhow::{anyhow, ensure, Context, Result};
use borsh::BorshDeserialize;
use metashrew_support::compat::to_arraybuffer_layout;
use metashrew_support::index_pointer::KeyValuePointer;
use metashrew_support::utils::consensus_decode;
use schemas::SchemaInitializeMerkleDistributorParameters;
use std::sync::Arc;
use token::MintableToken;

use utils::{extract_witness_payload, get_byte_array_from_inputs};

use crate::{
    consts::DEPLOYMENT_NETWORK,
    schemas::{SchemaAlkaneId, SchemaMerkleLeaf, SchemaMerkleProof},
    utils::{calc_merkle_root, decode_from_ctx, decode_from_vec},
};

#[derive(Default)]
pub struct MerkleDistributor(());

impl MerkleDistributor {
    fn get_serialized_transaction(&self) -> Result<Transaction> {
        let tx = consensus_decode::<Transaction>(&mut std::io::Cursor::new(self.transaction()))
            .map_err(|_| anyhow!("MERKLE DISTRIBUTOR: Failed to decode transaction"))?;
        Ok(tx)
    }

    fn get_merkle_root_pointer(&self) -> StoragePointer {
        StoragePointer::from_keyword("/merkleroot")
    }

    fn get_used_leaf_pointer(&self, leaf_bytes: &Vec<u8>) -> StoragePointer {
        StoragePointer::from_keyword("/used").select(leaf_bytes)
    }

    fn collapse_transfers_for_alkane(
        &self,
        alkane: SchemaAlkaneId,
        response: &mut CallResponse,
    ) -> Result<u128> {
        // Take ownership of the vector so we can drain it.
        let transfers: Vec<_> = response.alkanes.0.drain(..).collect();

        let mut total: u128 = 0;
        let mut remaining: Vec<_> = Vec::with_capacity(transfers.len());

        for t in transfers {
            if t.id == alkane.into() {
                // sum with overflow check
                total = total
                    .checked_add(t.value)
                    .context("MERKLE DISTRIBUTOR: overflow while summing transfer amounts")?;
            } else {
                remaining.push(t);
            }
        }

        // Put the survivors back into the response
        response.alkanes.0 = remaining;

        Ok(total)
    }

    fn validate_proof(&self, proof: &SchemaMerkleProof) -> Result<bool> {
        let params_bytes = {
            let ptr = self.get_merkle_root_pointer();
            // StoragePointer::get() returns Arc<[u8]>, clone to Vec<u8>
            (*ptr.get()).clone()
        };

        let params = decode_from_vec!(params_bytes, SchemaInitializeMerkleDistributorParameters)
            .context(
            "MERKLE DISTRIBUTOR: failed to decode initialization params when running proof check",
        )?;

        let root_from_proof = calc_merkle_root(&proof.leaf, &proof.proofs);

        let height_u128: u128 = self.height().into();
        let still_in_window = height_u128 <= params.block_end;
        let root_matches = params.merkle_root == root_from_proof;

        Ok(root_matches && still_in_window)
    }
}

impl MintableToken for MerkleDistributor {}

#[derive(MessageDispatch)]
enum MerkleDistributorMessage {
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
    GetIsValidClaim,

    #[opcode(106)]
    Claim,

    #[opcode(107)]
    GetInitializationParams,

    #[opcode(1000)]
    #[returns(Vec<u8>)]
    GetData,
}

impl MerkleDistributor {
    fn initialize(&self) -> Result<CallResponse> {
        self.observe_initialization()
            .map_err(|_| anyhow!("Contract already initialized"))?;

        let context = self.context()?;
        let mut response = CallResponse::forward(&context.incoming_alkanes);

        let params = decode_from_ctx!(&context, SchemaInitializeMerkleDistributorParameters)?;
        let mut ptr_merkle_root = self.get_merkle_root_pointer();

        let amount_passed_in =
            self.collapse_transfers_for_alkane(params.alkane_id, &mut response)?;

        let amount_expected = params.amount;

        ensure!(
            amount_passed_in >= params.amount,
            "MERKLE DISTRIBUTOR: Attempted to start merkle distributor contract with an amount greater than what was present in alkane transfers. Passed in: {amount_passed_in}. Expected: {amount_expected}"
        );

        let refund_amount = amount_passed_in.saturating_sub(params.amount);

        if refund_amount > 0 {
            response.alkanes.0.push(AlkaneTransfer {
                id: params.alkane_id.into(),
                value: refund_amount,
            })
        }
        ptr_merkle_root.set(Arc::new(borsh::to_vec(&params).context(
            "MERKLE DISTRIBUTOR: failed to encode merkle distributor params",
        )?));

        Ok(response)
    }

    fn get_is_valid_claim(&self) -> Result<CallResponse> {
        let ctx = self.context()?;
        let mut resp = CallResponse::forward(&ctx.incoming_alkanes);

        // decode the caller‑supplied proof (Borsh‑encoded in `ctx`)
        let merkle_proof = decode_from_ctx!(&ctx, SchemaMerkleProof)?;
        let ptr_used_leaf = self.get_used_leaf_pointer(&merkle_proof.leaf);
        let used_leaf_check = ptr_used_leaf.get_value::<u8>();

        ensure!(
            used_leaf_check != 0u8,
            "MERKLE DISTRIBUTOR: This leaf has already been used to claim"
        );
        let ok = self.validate_proof(&merkle_proof)?;

        // push u128 {1|0} as return value
        resp.data = if ok { vec![1u8] } else { vec![0u8] };
        Ok(resp)
    }

    fn get_initialization_params(&self) -> Result<CallResponse> {
        let ctx = self.context()?;
        let mut response = CallResponse::forward(&ctx.incoming_alkanes);

        let params_bytes = {
            let ptr = self.get_merkle_root_pointer();
            (*ptr.get()).clone()
        };

        response.data = params_bytes;
        Ok(response)
    }

    fn claim(&self) -> Result<CallResponse> {
        let ctx = self.context()?;
        let mut response = CallResponse::forward(&ctx.incoming_alkanes);

        self.validate_protostone_tx(&ctx)?;

        let tx = self
            .get_serialized_transaction()
            .map_err(|_| anyhow!("MERKLE DISTRIBUTOR: Failed to decode tx"))?;

        let witness_payload = match extract_witness_payload(&tx) {
            Some(bytes) => bytes,
            None => return Err(anyhow!("MERKLE DISTRIBUTOR: Failed to decode tx")),
        };

        let merkle_proof = decode_from_vec!(witness_payload, SchemaMerkleProof)
            .context("MERKLE DISTRIBUTOR: Failed to decode merkle proof from witness data")?;

        ensure!(
            self.validate_proof(&merkle_proof)?,
            "MERKLE DISTRIBUTOR: Merkle proof check failed",
        );

        let mut ptr_used_leaf = self.get_used_leaf_pointer(&merkle_proof.leaf);
        let used_leaf_check = ptr_used_leaf.get_value::<u8>();

        ensure!(
            used_leaf_check != 0u8,
            "MERKLE DISTRIBUTOR: This leaf has already been used to claim"
        );

        let leaf = decode_from_vec!(merkle_proof.leaf, SchemaMerkleLeaf)?;

        let caller_script_pub_key = tx
            .tx_out(0)
            .context("MERKLE DISTRIBUTOR: vout #0 not present")?
            .clone()
            .script_pubkey;

        let tx_address = Address::from_script(&caller_script_pub_key, DEPLOYMENT_NETWORK)?;

        ensure!(
            tx_address.to_string() == leaf.address,
            "MERKLE DISTRIBUTOR: vout #0 doesnt contain the address in merkle proof"
        );

        let params_bytes = {
            let ptr = self.get_merkle_root_pointer();
            (*ptr.get()).clone()
        };

        let params = decode_from_vec!(params_bytes, SchemaInitializeMerkleDistributorParameters)
            .context(
                "MERKLE DISTRIBUTOR: failed to decode initialization params when running claim",
            )?;

        ptr_used_leaf.set_value(1u8);
        response.alkanes.0.push(AlkaneTransfer {
            id: params.alkane_id.into(),
            value: leaf.amount,
        });

        Ok(response)
    }
}

impl AlkaneResponder for MerkleDistributor {}

// Use the MessageDispatch macro for opcode handling
declare_alkane! {
    impl AlkaneResponder for MerkleDistributor {
        type Message = MerkleDistributorMessage;
    }
}
