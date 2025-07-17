use crate::utils::encoders::get_byte_array_from_inputs;
use crate::{
    airdrop::{
        schemas::{SchemaMerkleLeaf, SchemaMerkleProof},
        utils::{calc_merkle_root, extract_witness_payload},
    },
    consts::{get_merkle_root_from_id, DEPLOYMENT_NETWORK},
    utils::encoders::{decode_from_ctx, decode_from_vec},
    Tortilla,
};
use alkanes_runtime::{runtime::AlkaneResponder, storage::StoragePointer};
use alkanes_support::{parcel::AlkaneTransfer, response::CallResponse};
use anyhow::{anyhow, ensure, Context, Result};
use bitcoin::Address;
use borsh::BorshDeserialize;
use metashrew_support::index_pointer::KeyValuePointer;

//STORAGE GETTERS
impl Tortilla {
    fn get_used_leaf_pointer(&self, leaf_bytes: &Vec<u8>) -> StoragePointer {
        StoragePointer::from_keyword("/used").select(leaf_bytes)
    }

    fn get_merkle_root(&self) -> Result<[u8; 32]> {
        let consts = self.get_consts_value()?;

        get_merkle_root_from_id(consts.merkle_root_id)
    }

    fn get_airdrop_end_height(&self) -> Result<u64> {
        let consts = self.get_consts_value()?;

        Ok(consts.airdrop_end_height)
    }

    fn validate_proof(&self, proof: &SchemaMerkleProof) -> Result<()> {
        let merkle_root = self.get_merkle_root()?;
        let airdrop_end_height = self.get_airdrop_end_height()?;

        let root_from_proof = calc_merkle_root(&proof.leaf, &proof.proofs);

        let still_in_window = self.height() <= airdrop_end_height;
        let root_matches = merkle_root == root_from_proof;

        ensure!(
            root_matches && still_in_window,
            "TORTILLA: Proof invalid or claim window expired"
        );

        Ok(())
    }
}

impl Tortilla {
    pub fn get_is_valid_airdrop_claim(&self) -> Result<CallResponse> {
        let ctx = self.context()?;
        let mut resp = CallResponse::forward(&ctx.incoming_alkanes);

        // decode the caller‑supplied proof (Borsh‑encoded in `ctx`)
        let merkle_proof = decode_from_ctx!(&ctx, SchemaMerkleProof)?;
        let ptr_used_leaf = self.get_used_leaf_pointer(&merkle_proof.leaf);
        let used_leaf_check = ptr_used_leaf.get_value::<u8>();

        ensure!(
            used_leaf_check == 0u8,
            "MERKLE DISTRIBUTOR: This leaf has already been used to claim"
        );
        self.validate_proof(&merkle_proof)?;

        resp.data = vec![1u8];
        Ok(resp)
    }

    pub fn claim_airdrop(&self) -> Result<CallResponse> {
        let ctx = self.context()?;
        let mut response = CallResponse::forward(&ctx.incoming_alkanes);

        let consts = self.get_consts_value()?;

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

        self.validate_proof(&merkle_proof)?;

        let mut ptr_used_leaf = self.get_used_leaf_pointer(&merkle_proof.leaf);
        let used_leaf_check = ptr_used_leaf.get_value::<u8>();

        ensure!(
            used_leaf_check == 0u8,
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

        ptr_used_leaf.set_value(1u8);

        //mint

        self.controlled_mint_contract_mint_new(
            &response,
            consts.tortilla_alkane_id.into(),
            leaf.amount,
        )?;

        response.alkanes.0.push(AlkaneTransfer {
            id: consts.tortilla_alkane_id.into(),
            value: leaf.amount,
        });

        Ok(response)
    }
}
