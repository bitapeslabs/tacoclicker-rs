use borsh::{BorshDeserialize, BorshSerialize};

use crate::schemas::SchemaAlkaneId;

#[derive(BorshSerialize, BorshDeserialize, PartialEq, Debug)]
pub struct SchemaGlobalEmissionState {
    pub total_weight: u128,
    pub acc_reward_per_weight: u128,
    pub last_updated_block: u128,
}

#[derive(BorshSerialize, BorshDeserialize, PartialEq, Debug)]
pub struct SchemaTaqueriaEmissionState {
    pub taqueria_weight: u128,
    pub reward_debt: u128,
    pub pending: u128,
    pub last_poc_hash: Vec<u8>,
}

#[derive(BorshSerialize, BorshDeserialize, PartialEq, Debug)]
pub struct SchemaUpgradesEntry {
    pub cost: u128,
    pub weight: u128,
    pub current_emission: u128,
}
#[derive(BorshSerialize, BorshDeserialize, PartialEq, Debug)]
pub struct SchemaUpgradesView {
    pub taquero: SchemaUpgradesEntry,
    pub salsa_bar: SchemaUpgradesEntry,
    pub tortilla_tree: SchemaUpgradesEntry,
    pub tortilla_factory: SchemaUpgradesEntry,
    pub taco_submarine: SchemaUpgradesEntry,
    pub taco_pyramid: SchemaUpgradesEntry,
    pub tortilla_spaceship: SchemaUpgradesEntry,
    pub satoshi_tacomoto: SchemaUpgradesEntry,
}

#[derive(BorshSerialize, BorshDeserialize, PartialEq, Debug)]
pub struct SchemaUserUpgradesEntry {
    pub amount: u128,
    pub next_price: u128, //Increases by 1.5x on each buy. 50000, 75000, etc etc. This is to incentivize people to chase bigger upgrades
}

#[derive(BorshSerialize, BorshDeserialize, PartialEq, Debug)]
pub struct SchemaGlobalSalsaState {
    pub current_block: u128,
    pub best_hash: Vec<u8>,
    pub best_hash_owner: Vec<u8>, //Increases by 1.5x on each buy. 50000, 75000, etc etc. This is to incentivize people to chase bigger upgrades
}

#[derive(BorshSerialize, BorshDeserialize, PartialEq, Debug)]
pub struct SchemaUserUpgradesView {
    pub taquero: SchemaUserUpgradesEntry,
    pub salsa_bar: SchemaUserUpgradesEntry,
    pub tortilla_tree: SchemaUserUpgradesEntry,
    pub tortilla_factory: SchemaUserUpgradesEntry,
    pub taco_submarine: SchemaUserUpgradesEntry,
    pub taco_pyramid: SchemaUserUpgradesEntry,
    pub tortilla_spaceship: SchemaUserUpgradesEntry,
    pub satoshi_tacomoto: SchemaUserUpgradesEntry,
}

#[derive(BorshSerialize, BorshDeserialize, PartialEq, Debug, Clone, Copy)]
pub enum UpgradeKind {
    Taquero,
    SalsaBar,
    TortillaTree,
    TortillaFactory,
    TacoBank,
    TacoPyramid,
    TortillaSpaceship,
    SatoshiTacomoto,
}

impl From<UpgradeKind> for u8 {
    fn from(kind: UpgradeKind) -> Self {
        match kind {
            UpgradeKind::Taquero => 0,
            UpgradeKind::SalsaBar => 1,
            UpgradeKind::TortillaTree => 2,
            UpgradeKind::TortillaFactory => 3,
            UpgradeKind::TacoBank => 4,
            UpgradeKind::TacoPyramid => 5,
            UpgradeKind::TortillaSpaceship => 6,
            UpgradeKind::SatoshiTacomoto => 7,
        }
    }
}

//buy_upgrade
#[derive(BorshSerialize, BorshDeserialize, PartialEq, Debug)]
pub struct SchemaBuyUpgradeParameters {
    pub upgrade: UpgradeKind,
}

//get available upgrades
#[derive(BorshSerialize, BorshDeserialize, PartialEq, Debug)]

pub struct SchemaTaqueriaSpecificParameters {
    pub taqueria: SchemaAlkaneId,
}

#[derive(BorshSerialize, BorshDeserialize, PartialEq, Debug)]

pub struct SchemaGetMultiplierFromHashParameters {
    pub hash_bytes_be: Vec<u8>,
}

#[derive(BorshSerialize, BorshDeserialize, PartialEq, Debug)]

pub struct SchemaGetMultiplierFromHashResponse {
    pub multiplier: u128,
}

#[derive(BorshSerialize, BorshDeserialize, PartialEq, Debug)]

pub struct SchemaGetUnclaimedTortillaResponse {
    pub unclaimed_tortilla: u128,
}
#[derive(BorshSerialize, BorshDeserialize, PartialEq, Debug)]

pub struct SchemaGetTortillaPerBlockResponse {
    pub tortilla_per_block: u128,
}

#[derive(BorshSerialize, BorshDeserialize, PartialEq, Debug)]

pub struct SchemaBetOnBlockParameters {
    pub nonce_found_poc: u128,
    pub target_multiplier: u128,
}

#[derive(BorshSerialize, BorshDeserialize, PartialEq, Debug)]

pub struct SchemaBetOnBlockResponse {
    pub won_amount: u128,
    pub lost_amount: u128,
}
#[derive(BorshSerialize, BorshDeserialize, PartialEq, Debug)]
pub struct SchemaCompleteGlobalState {
    pub emission_state: SchemaGlobalEmissionState,
    pub salsa_state: SchemaGlobalSalsaState,
}
