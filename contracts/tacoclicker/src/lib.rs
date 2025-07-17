//! Taco clicker tortilla contract
//!
//! Created by mork1e

pub mod consts;
pub mod game;
pub mod schemas;
pub mod token;
pub mod utils;

use alkanes_runtime::{declare_alkane, message::MessageDispatch, runtime::AlkaneResponder};
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
use std::sync::Arc;
use token::MintableToken;

use crate::consts::{
    get_merkle_root_from_id, TORTILLA_AIRDROP_PREMINE, TORTILLA_CLAIM_WINDOW, TORTILLA_PER_BLOCK,
};
use crate::game::consts::UPGRADES;
use crate::game::multipliers::{apply_multiplier, multiplier_from_seed};
use crate::game::schemas::{
    SchemaBetOnBlockParameters, SchemaBetOnBlockResponse, SchemaBuyUpgradeParameters,
    SchemaCompleteGlobalState, SchemaGetMultiplierFromHashParameters,
    SchemaGetMultiplierFromHashResponse, SchemaGetTortillaPerBlockResponse,
    SchemaGetUnclaimedTortillaResponse, SchemaGlobalEmissionState, SchemaGlobalSalsaState,
    SchemaTaqueriaEmissionState, SchemaTaqueriaSpecificParameters, SchemaUpgradesEntry,
    SchemaUpgradesView, SchemaUserUpgradesView, UpgradeKind,
};
use crate::game::utils::{get_upgrade_by_id, get_upgrade_entry_by_id, get_upgrade_entry_by_id_mut};
use crate::schemas::{
    SchemaAlkaneId, SchemaAlkaneList, SchemaControlledMintInitializationParameters,
    SchemaInitializeMerkleDistributorParameters, SchemaTacoClickerConsts,
    SchemaTacoClickerInitializationParameters,
};
use crate::utils::encoders::decode_from_ctx;
use crate::utils::encoders::{address_from_txout, decode_from_vec, get_byte_array_from_inputs};
use bitcoin::hashes::Hash;

#[derive(Default)]
pub struct Tortilla(());

impl MintableToken for Tortilla {}

//STORAGE GETTERS TORTILLA
impl Tortilla {
    fn get_consts_value(&self) -> Result<SchemaTacoClickerConsts> {
        let bytes = (*self.get_consts_pointer().get()).clone();
        decode_from_vec!(bytes, SchemaTacoClickerConsts)
    }

    fn get_valid_taquerias_from_alkane_list(&self, list: &SchemaAlkaneList) -> Vec<SchemaAlkaneId> {
        let found_alkanes: Vec<SchemaAlkaneId> = list
            .alkanes
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
        found_alkanes
    }

    fn get_taqueria_from_call(&self, response: &mut CallResponse) -> Result<SchemaAlkaneId> {
        let alkanes: Vec<SchemaAlkaneId> = response
            .alkanes
            .0
            .iter()
            .map(|transfer| {
                Ok(SchemaAlkaneId {
                    block: transfer.id.block.try_into().context(
                        "TORTILLA: failed to decode transfer id block into Schema Alkane ID",
                    )?,
                    tx: transfer.id.tx.try_into().context(
                        "TORTILLA: Failed to decode transfer id tx into Schema Alkane ID",
                    )?,
                })
            })
            .collect::<Result<_>>()?; // ← this propagates the first error encountered

        let alkane_list = SchemaAlkaneList { alkanes };

        let taquerias = self.get_valid_taquerias_from_alkane_list(&alkane_list);

        let taqueria_alkane = taquerias.get(0).context(
            "TORTILLA: Could not derive a taqueria from provided alkanes in transaction",
        )?;
        Ok(*taqueria_alkane)

        // return something, or just Ok(alkane_list) if SchemaAlkaneId was a typo
    }

    //removes all transfers of "alkane" from response and returns a cumulative value of the amount collected (now controlled by the contract)
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
                    .context("TORTILLA: overflow while summing transfer amounts")?;
            } else {
                remaining.push(t);
            }
        }

        // Put the survivors back into the response
        response.alkanes.0 = remaining;

        Ok(total)
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
    GetTaqueriaEmissionState,

    #[opcode(107)]
    #[returns(Vec<u8>)]
    GetTaqueriaFromAlkaneList,

    #[opcode(108)]
    GetTortillaId,

    #[opcode(110)]
    GetTortillaPerBlockForTaqueria,

    #[opcode(111)]
    GetUnclaimedTortillaForTaqueria,

    #[opcode(112)]
    GetUpgradesForTaqueria,

    #[opcode(113)]
    GetAvailableUpgrades,

    #[opcode(114)]
    GetMultiplierFromHash,

    #[opcode(115)]
    GetGlobalCompleteState,

    #[opcode(116)]
    BuyUpgrade,

    #[opcode(117)]
    BetOnBlock,

    #[opcode(118)]
    ClaimTortilla,

    #[opcode(119)]
    #[returns(Vec<u8>)]
    Register,

    #[opcode(120)]
    GetMerkleDistributorId,

    //#[opcode(118)]
    //ClaimTortillaAirdrop,
    #[opcode(1000)]
    #[returns(Vec<u8>)]
    GetData,
}

impl Tortilla {
    fn get_serialized_transaction(&self) -> Result<Transaction> {
        let tx = consensus_decode::<Transaction>(&mut std::io::Cursor::new(self.transaction()))
            .map_err(|_| anyhow!("TORTILLA: Failed to decode transaction"))?;
        Ok(tx)
    }

    pub fn blockhash(&self) -> Result<Vec<u8>> {
        Ok(self
            .block_header()
            .context("TORTILLA: failed to get blockhash")?
            .block_hash()
            .to_raw_hash()
            .to_byte_array()
            .to_vec())
    }

    fn initialize(&self) -> Result<CallResponse> {
        self.observe_initialization()
            .map_err(|_| anyhow!("Contract already initialized"))?;

        let context = self.context()?;
        let mut response = CallResponse::forward(&context.incoming_alkanes);

        let init_params = decode_from_ctx!(context, SchemaTacoClickerInitializationParameters)?;

        let tortilla_alkane_id = self.clone_at_target(
            &mut response,
            init_params.controlled_mint_factory.into(),
            &SchemaControlledMintInitializationParameters {
                token_name: "TORTILLA".to_string(),
                token_symbol: "TORTILLA".to_string(),
                premine: TORTILLA_AIRDROP_PREMINE,
                cap: u128::MAX,
            },
        )?;

        //must bubble new tortilla to response buffer so merkle_distributor has access to it
        response.alkanes.0.push(AlkaneTransfer {
            id: tortilla_alkane_id.into(),
            value: TORTILLA_AIRDROP_PREMINE,
        });

        let merkle_distributor_alkane_id = self.clone_at_target(
            &mut response,
            init_params.merkle_distributor_factory.into(),
            &SchemaInitializeMerkleDistributorParameters {
                merkle_root: get_merkle_root_from_id(init_params.merkle_root_id)?.to_vec(),
                alkane_id: tortilla_alkane_id.into(),
                amount: TORTILLA_AIRDROP_PREMINE,
                block_end: self.height().saturating_add(TORTILLA_CLAIM_WINDOW).into(),
            },
        )?;

        let consts = SchemaTacoClickerConsts {
            controlled_mint_factory: init_params.controlled_mint_factory,
            tortilla_alkane_id,
            merkle_distributor_alkane_id,
        };

        let consumed_bytes = borsh::to_vec(&consts)?;
        self.get_consts_pointer().set(Arc::new(consumed_bytes));

        let initial_global_emissions_state = SchemaGlobalEmissionState {
            total_weight: 0u128,
            acc_reward_per_weight: 0u128,
            last_updated_block: self.height().into(),
        };

        self.get_global_emission_state_pointer().set(Arc::new(
            borsh::to_vec(&initial_global_emissions_state)
                .context("TORTILLA: failed to encode default emissions state")?,
        ));

        let initial_salsa_state = SchemaGlobalSalsaState {
            current_block: 0u128,
            best_hash: Vec::new(),
            best_hash_owner: Vec::new(),
        };

        self.get_global_salsa_state_pointer().set(Arc::new(
            borsh::to_vec(&initial_salsa_state)
                .context("TORTILLA: failed to encode initial salsa state")?,
        ));

        Ok(response)
    }

    fn get_consts(&self) -> Result<CallResponse> {
        let context = self.context()?;
        let mut response = CallResponse::forward(&context.incoming_alkanes);

        response.data = (*self.get_consts_pointer().get()).clone();

        Ok(response)
    }

    fn get_tortilla_id(&self) -> Result<CallResponse> {
        let context = self.context()?;
        let mut response = CallResponse::forward(&context.incoming_alkanes);

        let consts = self.get_consts_value()?;

        response.data = borsh::to_vec(&consts.tortilla_alkane_id)?;

        Ok(response)
    }

    fn get_merkle_distributor_id(&self) -> Result<CallResponse> {
        let context = self.context()?;
        let mut response = CallResponse::forward(&context.incoming_alkanes);

        let consts = self.get_consts_value()?;

        response.data = borsh::to_vec(&consts.merkle_distributor_alkane_id)?;

        Ok(response)
    }

    fn get_taqueria_emission_state(&self) -> Result<CallResponse> {
        let context = self.context()?;
        let mut response = CallResponse::forward(&context.incoming_alkanes);

        let params = decode_from_ctx!(context, SchemaTaqueriaSpecificParameters)?;

        let consts = self.get_taqueria_emission_state_pointer(&params.taqueria)?;

        let taqueria_emission_state_bytes = (*consts.get()).clone();

        response.data = borsh::to_vec(&taqueria_emission_state_bytes)?;

        Ok(response)
    }

    fn get_global_complete_state(&self) -> Result<CallResponse> {
        let context = self.context()?;
        let mut response = CallResponse::forward(&context.incoming_alkanes);

        let ptr_global_emission_state = self.get_global_emission_state_pointer();
        let ptr_salsa_state = self.get_global_salsa_state_pointer();

        let global_emission_state_bytes = (*ptr_global_emission_state.get()).clone();
        let salsa_state_bytes = (*ptr_salsa_state.get()).clone();

        let global_emission_state =
            decode_from_vec!(global_emission_state_bytes, SchemaGlobalEmissionState)?;
        let salsa_state = decode_from_vec!(salsa_state_bytes, SchemaGlobalSalsaState)?;

        let global_state_bytes = borsh::to_vec(&SchemaCompleteGlobalState {
            emission_state: global_emission_state,
            salsa_state: salsa_state,
        })?;

        response.data = global_state_bytes;

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

        let next_alkane = self.clone_at_target(
            &mut response,
            consts.controlled_mint_factory.into(),
            &SchemaControlledMintInitializationParameters {
                token_name: "TAQUERIA".to_string(),
                token_symbol: "TAQUERIA".to_string(),
                premine: 1u128,
                cap: 1u128,
            },
        )?;

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

        self.create_taqueria_deps(&next_alkane)?;

        response.data = borsh::to_vec(&next_alkane)
            .context("TORTILLA: failed to Borsh-serialize next_alkane")?;

        Ok(response)
    }

    fn buy_upgrade(&self) -> Result<CallResponse> {
        let ctx = self.context()?;
        let mut response = CallResponse::forward(&ctx.incoming_alkanes);
        let taqueria = self.get_taqueria_from_call(&mut response)?;
        let params = decode_from_ctx!(ctx, SchemaBuyUpgradeParameters)?;
        let consts = self.get_consts_value()?;
        let tortilla_recouped =
            self.collapse_transfers_for_alkane(consts.tortilla_alkane_id, &mut response)?;

        let mut ptr_taqueria_upgrades = self.get_taqueria_upgrades_pointer(&taqueria)?;
        let taqueria_upgrades_bytes = (*ptr_taqueria_upgrades.get()).clone();

        let mut upgrades: SchemaUserUpgradesView =
            decode_from_vec!(taqueria_upgrades_bytes, SchemaUserUpgradesView)?;
        let entry = get_upgrade_entry_by_id_mut(&mut upgrades, params.upgrade.into())?;
        ensure!(
            entry.next_price <= tortilla_recouped,
            "TORTILLA: not enough tortilla for this upgrade"
        );

        self.update_global()?;

        let mut ptr_global_emission_state = self.get_global_emission_state_pointer();
        let mut ptr_taqueria_emission_state =
            self.get_taqueria_emission_state_pointer(&taqueria)?;

        let global_emission_state_bytes = (*ptr_global_emission_state.get()).clone();
        let taqueria_emission_state_bytes = (*ptr_taqueria_emission_state.get()).clone();

        let mut global: SchemaGlobalEmissionState =
            decode_from_vec!(global_emission_state_bytes, SchemaGlobalEmissionState)?;
        let mut taq_state: SchemaTaqueriaEmissionState =
            decode_from_vec!(taqueria_emission_state_bytes, SchemaTaqueriaEmissionState)?;

        let earned = taq_state
            .taqueria_weight
            .checked_mul(global.acc_reward_per_weight)
            .context("TORTILLA: mul overflow at earned calculation")?
            .checked_sub(taq_state.reward_debt)
            .context("TORTILLA: sub underflow at earned calculation")?;
        taq_state.pending = taq_state.pending.saturating_add(earned);

        let add_w = get_upgrade_by_id(params.upgrade.into())?.weight;
        taq_state.taqueria_weight = taq_state.taqueria_weight.saturating_add(add_w);
        global.total_weight = global.total_weight.saturating_add(add_w);
        taq_state.reward_debt = taq_state
            .taqueria_weight
            .checked_mul(global.acc_reward_per_weight)
            .context("TORTILLA: mul overflow at debt calc")?;

        //Refund user change that wasnt used to buy the upgrade
        response.alkanes.0.push(AlkaneTransfer {
            id: consts.tortilla_alkane_id.into(),
            value: tortilla_recouped
                .checked_sub(entry.next_price)
                .context("TORTILLA: checked sub failed for refund")?,
        });

        entry.next_price = entry
            .next_price
            .checked_mul(3)
            .context("TORTILLA: price overflow")?
            .checked_div(2)
            .unwrap(); // safe now
        entry.amount = entry.amount.saturating_add(1u128);

        ptr_taqueria_upgrades.set(Arc::new(borsh::to_vec(&upgrades)?));
        ptr_taqueria_emission_state.set(Arc::new(borsh::to_vec(&taq_state)?));
        ptr_global_emission_state.set(Arc::new(borsh::to_vec(&global)?));

        Ok(response)
    }

    pub fn bet_on_block(&self) -> Result<CallResponse> {
        let ctx = self.context()?;
        let mut rsp = CallResponse::forward(&ctx.incoming_alkanes);
        let params = decode_from_ctx!(ctx, SchemaBetOnBlockParameters)?;
        let taqueria = self.get_taqueria_from_call(&mut rsp)?;

        self.proof_of_click(&taqueria, params.nonce_found_poc)
            .context("TORTILLA: Proof‑of‑Click failed")?;

        let bhash_bytes = self.blockhash()?;
        let multiplier = multiplier_from_seed(&bhash_bytes)?;

        let unclaimed = self.calc_unclaimed_tortilla(&taqueria)?;

        let mut ptr_taq = self.get_taqueria_emission_state_pointer(&taqueria)?;

        let taqueria_emission_state_bytes = (*ptr_taq.get()).clone();

        let mut taq: SchemaTaqueriaEmissionState =
            decode_from_vec!(taqueria_emission_state_bytes, SchemaTaqueriaEmissionState)?;

        let (won_amt, lost_amt) = if multiplier > params.target_multiplier {
            let new_amt = apply_multiplier(unclaimed, &bhash_bytes)?;
            taq.pending = new_amt; // replace pending with boosted amount
            (new_amt.saturating_sub(unclaimed), 0)
        } else {
            taq.pending = 0; // burn all unclaimed tortilla
            (0, unclaimed)
        };

        // bring reward_debt up to date with latest acc index
        let global: SchemaGlobalEmissionState = {
            let b = (*self.get_global_emission_state_pointer().get()).clone();
            decode_from_vec!(b, SchemaGlobalEmissionState)?
        };
        taq.reward_debt = taq
            .taqueria_weight
            .checked_mul(global.acc_reward_per_weight)
            .context("TORTILLA: overflow updating reward debt")?;

        self.update_global_salsa(&taqueria)?;

        // persist taqueria state
        ptr_taq.set(Arc::new(borsh::to_vec(&taq)?));

        // ───────────────────────────── 6. build response
        let resp_struct = SchemaBetOnBlockResponse {
            won_amount: won_amt,
            lost_amount: lost_amt,
        };
        rsp.data = borsh::to_vec(&resp_struct)?;

        Ok(rsp)
    }

    pub fn claim_tortilla(&self) -> Result<CallResponse> {
        let ctx = self.context()?;
        let mut response = CallResponse::forward(&ctx.incoming_alkanes);
        let taqueria = self.get_taqueria_from_call(&mut response)?;

        let consts = self.get_consts_value()?;

        let ptr_global_emission_state = self.get_global_emission_state_pointer();
        let mut ptr_taqueria_emission_state =
            self.get_taqueria_emission_state_pointer(&taqueria.into())?;

        self.update_global()?;

        let claim_amount = self.calc_unclaimed_tortilla(&taqueria.into())?;
        ensure!(claim_amount > 0, "TORTILLA: nothing to claim");

        let global_emission_state_bytes = (*ptr_global_emission_state.get()).clone();

        let taqueria_emission_state_bytes = (*ptr_taqueria_emission_state.get()).clone();

        let global_emission_state: SchemaGlobalEmissionState =
            decode_from_vec!(global_emission_state_bytes, SchemaGlobalEmissionState)?;
        let mut taqueria_emission_state: SchemaTaqueriaEmissionState =
            decode_from_vec!(taqueria_emission_state_bytes, SchemaTaqueriaEmissionState)?;

        taqueria_emission_state.pending = 0;
        taqueria_emission_state.reward_debt = taqueria_emission_state
            .taqueria_weight
            .checked_mul(global_emission_state.acc_reward_per_weight)
            .context("TORTILLA: overflow updating debt")?;

        ptr_taqueria_emission_state.set(Arc::new(borsh::to_vec(&taqueria_emission_state)?));

        //Mint the tortilla
        self.controlled_mint_contract_mint_new(
            &response,
            consts.tortilla_alkane_id.into(),
            claim_amount,
        )?;

        response.alkanes.0.push(AlkaneTransfer {
            id: consts.tortilla_alkane_id.into(),
            value: claim_amount,
        });

        Ok(response)
    }

    pub fn get_available_upgrades(&self) -> Result<CallResponse> {
        let ctx = self.context()?;
        let mut response = CallResponse::forward(&ctx.incoming_alkanes);
        let params = decode_from_ctx!(ctx, SchemaTaqueriaSpecificParameters)?;
        let ptr_global_emission_state = self.get_global_emission_state_pointer();

        let global_emission_state_bytes = (*ptr_global_emission_state.get()).clone();

        let global: SchemaGlobalEmissionState =
            decode_from_vec!(global_emission_state_bytes, SchemaGlobalEmissionState)?;

        let tortilla_per_block = TORTILLA_PER_BLOCK; // already ×10⁸
        let total_weight = global.total_weight; // u128
        let use_base_costs = params.taqueria.block == 0 && params.taqueria.tx == 0;

        let maybe_upgrades_view: Option<SchemaUserUpgradesView> = if !use_base_costs {
            match self.get_taqueria_upgrades_pointer(&params.taqueria) {
                Ok(ptr) => {
                    let bytes = (*ptr.get()).clone();
                    Some(decode_from_vec!(bytes, SchemaUserUpgradesView)?)
                }
                Err(_) => None, // not found; fall back to base costs
            }
        } else {
            None
        };

        fn make_entry(
            id: UpgradeKind,
            weight: u128,
            base_cost: u128,
            upgrades_view: Option<&SchemaUserUpgradesView>,
            total_weight: u128,
            tortilla_per_block: u128,
        ) -> SchemaUpgradesEntry {
            let next_cost = upgrades_view
                .and_then(|v| get_upgrade_entry_by_id(v, id.into()).ok())
                .map(|e| e.next_price)
                .unwrap_or(base_cost);

            let current_emission: u128 = if total_weight == 0 {
                // Nobody has any weight yet; one unit of this upgrade captures the full emission.
                TORTILLA_PER_BLOCK
            } else {
                weight
                    .saturating_mul(tortilla_per_block) // guard overflow
                    / total_weight // safe: divisor > 0
            };

            SchemaUpgradesEntry {
                cost: next_cost,
                current_emission,
                weight,
            }
        }

        let view = SchemaUpgradesView {
            taquero: make_entry(
                UpgradeKind::Taquero,
                UPGRADES.taquero.weight,
                UPGRADES.taquero.base_cost,
                maybe_upgrades_view.as_ref(),
                total_weight,
                tortilla_per_block,
            ),
            salsa_bar: make_entry(
                UpgradeKind::SalsaBar,
                UPGRADES.salsa_bar.weight,
                UPGRADES.salsa_bar.base_cost,
                maybe_upgrades_view.as_ref(),
                total_weight,
                tortilla_per_block,
            ),
            tortilla_tree: make_entry(
                UpgradeKind::TortillaTree,
                UPGRADES.tortilla_tree.weight,
                UPGRADES.tortilla_tree.base_cost,
                maybe_upgrades_view.as_ref(),
                total_weight,
                tortilla_per_block,
            ),
            tortilla_factory: make_entry(
                UpgradeKind::TortillaFactory,
                UPGRADES.tortilla_factory.weight,
                UPGRADES.tortilla_factory.base_cost,
                maybe_upgrades_view.as_ref(),
                total_weight,
                tortilla_per_block,
            ),
            taco_submarine: make_entry(
                UpgradeKind::TacoBank,
                UPGRADES.taco_submarine.weight,
                UPGRADES.taco_submarine.base_cost,
                maybe_upgrades_view.as_ref(),
                total_weight,
                tortilla_per_block,
            ),
            taco_pyramid: make_entry(
                UpgradeKind::TacoPyramid,
                UPGRADES.taco_pyramid.weight,
                UPGRADES.taco_pyramid.base_cost,
                maybe_upgrades_view.as_ref(),
                total_weight,
                tortilla_per_block,
            ),
            tortilla_spaceship: make_entry(
                UpgradeKind::TortillaSpaceship,
                UPGRADES.tortilla_spaceship.weight,
                UPGRADES.tortilla_spaceship.base_cost,
                maybe_upgrades_view.as_ref(),
                total_weight,
                tortilla_per_block,
            ),
            satoshi_tacomoto: make_entry(
                UpgradeKind::SatoshiTacomoto,
                UPGRADES.satoshi_tacomoto.weight,
                UPGRADES.satoshi_tacomoto.base_cost,
                maybe_upgrades_view.as_ref(),
                total_weight,
                tortilla_per_block,
            ),
        };

        response.data = borsh::to_vec(&view)?;
        Ok(response)
    }

    fn get_tortilla_per_block_for_taqueria(&self) -> Result<CallResponse> {
        let ctx = self.context()?;
        let mut response = CallResponse::forward(&ctx.incoming_alkanes);
        let params = decode_from_ctx!(ctx, SchemaTaqueriaSpecificParameters)?;

        let global: SchemaGlobalEmissionState = {
            let bytes = (*self.get_global_emission_state_pointer().get()).clone();
            decode_from_vec!(bytes, SchemaGlobalEmissionState)?
        };
        let total_weight = global.total_weight;

        let taq_state: SchemaTaqueriaEmissionState = {
            let ptr = self
                .get_taqueria_emission_state_pointer(&params.taqueria)
                .context("TORTILLA: taqueria emission state not found")?;
            let bytes = (*ptr.get()).clone();
            decode_from_vec!(bytes, SchemaTaqueriaEmissionState)?
        };
        let taq_weight = taq_state.taqueria_weight;

        let emission: u128 = if total_weight == 0 {
            TORTILLA_PER_BLOCK
        } else {
            taq_weight
                .saturating_mul(TORTILLA_PER_BLOCK)   // overflow‑safe
                / total_weight // divisor > 0
        };

        let emission_response = SchemaGetTortillaPerBlockResponse {
            tortilla_per_block: emission,
        };

        response.data = borsh::to_vec(&emission_response)?;
        Ok(response)
    }

    fn get_unclaimed_tortilla_for_taqueria(&self) -> Result<CallResponse> {
        // ─────────────────────────────────── 0. plumbing
        let ctx = self.context()?;
        let mut response = CallResponse::forward(&ctx.incoming_alkanes);
        let params = decode_from_ctx!(ctx, SchemaTaqueriaSpecificParameters)?;

        let unclaimed_tortilla_response = SchemaGetUnclaimedTortillaResponse {
            unclaimed_tortilla: self.calc_unclaimed_tortilla(&params.taqueria)?,
        };
        response.data = borsh::to_vec(&unclaimed_tortilla_response)?;
        Ok(response)
    }

    fn get_multiplier_from_hash(&self) -> Result<CallResponse> {
        let ctx = self.context()?;
        let mut response = CallResponse::forward(&ctx.incoming_alkanes);

        let params = decode_from_ctx!(ctx, SchemaGetMultiplierFromHashParameters)?;

        ensure!(
            !params.hash_bytes_be.is_empty(),
            "TORTILLA: hash_bytes_be cannot be empty"
        );

        let mult_scaled = multiplier_from_seed(&params.hash_bytes_be)?;

        let resp = SchemaGetMultiplierFromHashResponse {
            multiplier: mult_scaled,
        };
        response.data = borsh::to_vec(&resp)?;

        Ok(response)
    }

    pub fn get_upgrades_for_taqueria(&self) -> Result<CallResponse> {
        let ctx = self.context()?;
        let mut response = CallResponse::forward(&ctx.incoming_alkanes);
        let params = decode_from_ctx!(ctx, SchemaTaqueriaSpecificParameters)?;

        ensure!(
            !(params.taqueria.block == 0 && params.taqueria.tx == 0),
            "TORTILLA: taqueria upgrades not found"
        );

        let ptr = self
            .get_taqueria_upgrades_pointer(&params.taqueria)
            .map_err(|_| anyhow!("TORTILLA: taqueria upgrades not found"))?;

        let bytes = (*ptr.get()).clone();
        let upgrades: SchemaUserUpgradesView = decode_from_vec!(bytes, SchemaUserUpgradesView)
            .context("TORTILLA: failed to decode taqueria upgrades")?;

        response.data = borsh::to_vec(&upgrades)?;
        Ok(response)
    }

    fn get_taqueria_from_alkane_list(&self) -> Result<CallResponse> {
        let context = self.context()?;
        let mut response = CallResponse::forward(&context.incoming_alkanes);

        //Just one thing is passed to taqueria init, and that is the tortilla contract
        let alkane_list = decode_from_ctx!(context, SchemaAlkaneList)?;
        let found_alkanes: Vec<SchemaAlkaneId> =
            self.get_valid_taquerias_from_alkane_list(&alkane_list);

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
