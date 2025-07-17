//Store all pointers for taco clicker here.

use crate::consts::{SALSA_BLOCK_REWARD, TORTILLA_PER_BLOCK};
use crate::game::consts::UPGRADES;
use crate::game::schemas::{
    SchemaGlobalEmissionState, SchemaGlobalSalsaState, SchemaTaqueriaEmissionState,
    SchemaUserUpgradesEntry,
};
use crate::utils::encoders::decode_from_vec;
use crate::Tortilla;
use crate::{game::schemas::SchemaUserUpgradesView, schemas::SchemaAlkaneId};
use alkanes_runtime::runtime::AlkaneResponder;
use alkanes_runtime::storage::StoragePointer;
use anyhow::{ensure, Context, Result};
use bitcoin::hashes::Hash;
use borsh::BorshDeserialize;
use metashrew_support::index_pointer::KeyValuePointer;
use sha2::{Digest, Sha256};
use std::sync::Arc;

impl Tortilla {
    pub fn get_consts_pointer(&self) -> StoragePointer {
        StoragePointer::from_keyword("/consts")
    }

    pub fn get_global_salsa_state_pointer(&self) -> StoragePointer {
        StoragePointer::from_keyword("/salsa_global_state")
    }

    pub fn get_taquerias_pointer(&self, taqueria: &SchemaAlkaneId) -> Result<StoragePointer> {
        Ok(StoragePointer::from_keyword("/taquerias")
            .select(&borsh::to_vec(taqueria).context("TORTILLA: failed to get taquerias pointer")?))
    }

    pub fn get_taqueria_upgrades_pointer(
        &self,
        taqueria: &SchemaAlkaneId,
    ) -> Result<StoragePointer> {
        Ok(StoragePointer::from_keyword("/taqueria_upgrades").select(
            &borsh::to_vec(taqueria)
                .context("TORTILLA: failed to get taqueria upgrades pointer")?,
        ))
    }

    pub fn get_taqueria_emission_state_pointer(
        &self,
        taqueria: &SchemaAlkaneId,
    ) -> Result<StoragePointer> {
        Ok(
            StoragePointer::from_keyword("/taqueria_emission_state").select(
                &borsh::to_vec(taqueria)
                    .context("TORTILLA: failed to get taqueria emission state pointer")?,
            ),
        )
    }

    pub fn get_global_emission_state_pointer(&self) -> StoragePointer {
        StoragePointer::from_keyword("/global_emission")
    }
}

//Storage mutation helper libs
impl Tortilla {
    pub fn update_global(&self) -> Result<()> {
        let now_block: u128 = self.height().into();

        let mut ptr = self.get_global_emission_state_pointer();
        let bytes = (*ptr.get()).clone();

        let mut state: SchemaGlobalEmissionState =
            decode_from_vec!(bytes, SchemaGlobalEmissionState)
                .context("TORTILLA: failed to decode global emission state")?;

        // 2. No‑op guard – already updated for this block ──────────────────────────
        if now_block == state.last_updated_block {
            return Ok(());
        }

        // 3. Gap length in blocks (checked math prevents underflow) ───────────────
        let blocks = now_block
            .checked_sub(state.last_updated_block)
            .context("TORTILLA: block underflow")?;

        // 4. Mint only if someone is staked ───────────────────────────────────────
        if state.total_weight > 0 {
            // ΔACC = blocks * EMISSION_PER_BLOCK * SCALE / total_weight
            let delta = (blocks as u128).saturating_mul(TORTILLA_PER_BLOCK) / state.total_weight;

            state.acc_reward_per_weight = state.acc_reward_per_weight.saturating_add(delta);
        }

        // 5. Slide the cursor forward ─────────────────────────────────────────────
        state.last_updated_block = now_block;

        // 6. Persist the mutated struct back to storage ───────────────────────────
        let encoded =
            borsh::to_vec(&state).context("TORTILLA: failed to encode global emission state")?;
        ptr.set(Arc::new(encoded));

        Ok(())
    }

    pub fn create_taqueria_deps(&self, taqueria: &SchemaAlkaneId) -> Result<()> {
        let mut upgrades_slot_pointer = self.get_taqueria_upgrades_pointer(taqueria)?;

        let mut taqueria_emission_state_pointer =
            self.get_taqueria_emission_state_pointer(taqueria)?;

        let mut global_emission_state_pointer = self.get_global_emission_state_pointer();

        let default_user_upgrades_view = SchemaUserUpgradesView {
            taquero: SchemaUserUpgradesEntry {
                amount: 1u128,
                next_price: UPGRADES.taquero.base_cost,
            },
            salsa_bar: SchemaUserUpgradesEntry {
                amount: 0u128,
                next_price: UPGRADES.salsa_bar.base_cost,
            },
            tortilla_tree: SchemaUserUpgradesEntry {
                amount: 0u128,
                next_price: UPGRADES.tortilla_tree.base_cost,
            },
            tortilla_factory: SchemaUserUpgradesEntry {
                amount: 0u128,
                next_price: UPGRADES.tortilla_factory.base_cost,
            },
            taco_submarine: SchemaUserUpgradesEntry {
                amount: 0u128,
                next_price: UPGRADES.taco_submarine.base_cost,
            },
            taco_pyramid: SchemaUserUpgradesEntry {
                amount: 0u128,
                next_price: UPGRADES.taco_pyramid.base_cost,
            },
            tortilla_spaceship: SchemaUserUpgradesEntry {
                amount: 0u128,
                next_price: UPGRADES.tortilla_spaceship.base_cost,
            },
            satoshi_tacomoto: SchemaUserUpgradesEntry {
                amount: 0u128,
                next_price: UPGRADES.satoshi_tacomoto.base_cost,
            },
        };

        upgrades_slot_pointer.set(Arc::new(
            borsh::to_vec(&default_user_upgrades_view)
                .context("TORTILLA: Failed to set upgrades slot pointer")?,
        ));

        let default_user_emission_state_view = SchemaTaqueriaEmissionState {
            taqueria_weight: UPGRADES.taquero.weight,
            reward_debt: 0u128,
            pending: 0u128,
            last_poc_hash: Vec::new(),
        };

        taqueria_emission_state_pointer.set(Arc::new(
            borsh::to_vec(&default_user_emission_state_view)
                .context("TORTILLA: failed to encode default taqueria emission state")?,
        ));

        let global_emission_bytes = (*global_emission_state_pointer.get()).clone();

        let mut global_emission_state =
            decode_from_vec!(global_emission_bytes, SchemaGlobalEmissionState)?;

        global_emission_state.total_weight += 1;

        global_emission_state_pointer
            .set(Arc::new(borsh::to_vec(&global_emission_state).context(
                "TORTILLA: Failed to encode global emission state",
            )?));

        Ok(())
    }

    pub fn calc_unclaimed_tortilla(&self, taqueria: &SchemaAlkaneId) -> Result<u128> {
        let now_block: u128 = self.height().into();

        let global_bytes = (*self.get_global_emission_state_pointer().get()).clone();
        let global: SchemaGlobalEmissionState =
            decode_from_vec!(global_bytes, SchemaGlobalEmissionState)?;

        let blocks = now_block
            .checked_sub(global.last_updated_block)
            .context("TORTILLA: block underflow in calc_unclaimed")?;

        let acc_now = if global.total_weight > 0 && blocks > 0 {
            global.acc_reward_per_weight + (blocks * TORTILLA_PER_BLOCK) / global.total_weight
        } else {
            global.acc_reward_per_weight
        };

        let taq_ptr = self
            .get_taqueria_emission_state_pointer(taqueria)
            .context("TORTILLA: taqueria emission state not found")?;

        let taqueria_emission_state_bytes = (*taq_ptr.get()).clone();

        let taq: SchemaTaqueriaEmissionState =
            decode_from_vec!(taqueria_emission_state_bytes, SchemaTaqueriaEmissionState)?;

        // earned_since_last = weight * acc_now − reward_debt
        let earned_since_last = taq
            .taqueria_weight
            .checked_mul(acc_now)
            .context("TORTILLA: mul ovf in calc_unclaimed")?
            .checked_sub(taq.reward_debt)
            .context("TORTILLA: underflow in calc_unclaimed")?;

        Ok(taq.pending.saturating_add(earned_since_last))
    }

    pub fn update_global_salsa(&self, taqueria: &SchemaAlkaneId) -> Result<()> {
        let current_height = self.height() as u128;
        let tx_bytes = self
            .get_serialized_transaction()?
            .compute_txid()
            .as_byte_array()
            .to_vec();

        let block_hash_bytes: Vec<u8> = self.blockhash()?;

        let mut ptr_salsa_global_state = self.get_global_salsa_state_pointer();
        let global_salsa_state_bytes = (*ptr_salsa_global_state.get()).clone();
        let mut salsa: SchemaGlobalSalsaState =
            decode_from_vec!(global_salsa_state_bytes, SchemaGlobalSalsaState)?;

        //conveniently, the clockin block is at an offset of 5 from modulo 144. This means by doing this
        //People, who are already online waiting for clockin, will be able to participate in the salsa block
        if current_height % 144 == 0 && salsa.current_block != current_height {
            salsa.current_block = current_height;
            salsa.best_hash.clear();
            salsa.best_hash_owner.clear();
        }

        let mut txid = [0u8; 32];
        txid.copy_from_slice(&tx_bytes[..32]);
        let mut bhash = [0u8; 32];
        bhash.copy_from_slice(&block_hash_bytes[..32]);
        let xor = {
            let mut out = [0u8; 32];
            for i in 0..32 {
                out[i] = txid[i] ^ bhash[i];
            }
            out
        };
        let candidate = sha2::Sha256::digest(&xor).to_vec();

        let beats_current = salsa.best_hash.is_empty() || candidate < salsa.best_hash;
        if beats_current {
            {
                let mut ptr_taqueria_emission_state =
                    self.get_taqueria_emission_state_pointer(taqueria)?;
                let taqueria_emission_state_bytes = (*ptr_taqueria_emission_state.get()).clone();
                let mut taq: SchemaTaqueriaEmissionState =
                    decode_from_vec!(taqueria_emission_state_bytes, SchemaTaqueriaEmissionState)?;
                taq.pending = taq.pending.saturating_add(SALSA_BLOCK_REWARD);
                ptr_taqueria_emission_state.set(Arc::new(borsh::to_vec(&taq)?));
            }

            if !salsa.best_hash_owner.is_empty() {
                let best_hash_clone = salsa.best_hash_owner.clone();
                let prev_owner: SchemaAlkaneId = decode_from_vec!(best_hash_clone, SchemaAlkaneId)?;
                let mut ptr_prev_taqueria_emission_state =
                    self.get_taqueria_emission_state_pointer(&prev_owner)?;

                let prev_taqueria_emission_state_bytes =
                    (*ptr_prev_taqueria_emission_state.get()).clone();

                let mut prev: SchemaTaqueriaEmissionState = decode_from_vec!(
                    prev_taqueria_emission_state_bytes,
                    SchemaTaqueriaEmissionState
                )?;
                prev.pending = prev.pending.saturating_sub(SALSA_BLOCK_REWARD);
                ptr_prev_taqueria_emission_state.set(Arc::new(borsh::to_vec(&prev)?));
            }

            salsa.best_hash = candidate.to_vec();
            salsa.best_hash_owner = borsh::to_vec(&taqueria)?;
        }

        ptr_salsa_global_state.set(Arc::new(borsh::to_vec(&salsa)?));

        Ok(())
    }

    pub fn proof_of_click(
        &self,
        taqueria: &SchemaAlkaneId,
        nonce_found_poc: u128,
    ) -> Result<Vec<u8>> {
        // ─────────────────────────────── 1. load emission state for this taqueria
        let mut ptr = self
            .get_taqueria_emission_state_pointer(taqueria)
            .context("TORTILLA: taqueria emission state not found")?;

        let taqueria_emission_state_bytes = (*ptr.get()).clone();

        let mut state: SchemaTaqueriaEmissionState =
            decode_from_vec!(taqueria_emission_state_bytes, SchemaTaqueriaEmissionState)?;

        // ─────────────────────────────── 2. build input buffer
        let mut buf = Vec::with_capacity(32 + 16 + state.last_poc_hash.len());

        // 2a. alkane_id → Borsh bytes
        buf.extend(borsh::to_vec(taqueria)?);

        // 2b. nonce → 16‑byte big‑endian
        buf.extend_from_slice(&nonce_found_poc.to_be_bytes());

        // 2c. previous hash (could be empty on first run)
        buf.extend_from_slice(&state.last_poc_hash);

        // ─────────────────────────────── 3. compute SHA‑256
        let new_hash = Sha256::digest(&buf);

        // ─────────────────────────────── 4. leading‑byte rule
        ensure!(
            new_hash[0] == 0x00,
            "TORTILLA: new PoC hash does not start with 0x00"
        );

        // ─────────────────────────────── 5. persist & return
        state.last_poc_hash = new_hash.to_vec();
        ptr.set(Arc::new(borsh::to_vec(&state)?));

        Ok(state.last_poc_hash.clone())
    }
}
