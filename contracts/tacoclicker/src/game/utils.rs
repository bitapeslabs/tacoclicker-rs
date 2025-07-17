use crate::game::consts::{UpgradeSheetPriceEntry, UPGRADES};
use crate::game::schemas::{SchemaUserUpgradesEntry, SchemaUserUpgradesView};
use anyhow::{anyhow, Result};

pub fn get_upgrade_by_id(id: u8) -> Result<&'static UpgradeSheetPriceEntry> {
    match id {
        0 => Ok(&UPGRADES.taquero),
        1 => Ok(&UPGRADES.salsa_bar),
        2 => Ok(&UPGRADES.tortilla_tree),
        3 => Ok(&UPGRADES.tortilla_factory),
        4 => Ok(&UPGRADES.taco_submarine),
        5 => Ok(&UPGRADES.taco_pyramid),
        6 => Ok(&UPGRADES.tortilla_spaceship),
        7 => Ok(&UPGRADES.satoshi_tacomoto),
        _ => Err(anyhow!("TORTILLA: invalid upgrade ID {id}")),
    }
}
pub fn get_upgrade_entry_by_id_mut<'a>(
    upgrades: &'a mut SchemaUserUpgradesView,
    id: u8,
) -> Result<&'a mut SchemaUserUpgradesEntry> {
    match id {
        0 => Ok(&mut upgrades.taquero),
        1 => Ok(&mut upgrades.salsa_bar),
        2 => Ok(&mut upgrades.tortilla_tree),
        3 => Ok(&mut upgrades.tortilla_factory),
        4 => Ok(&mut upgrades.taco_submarine),
        5 => Ok(&mut upgrades.taco_pyramid),
        6 => Ok(&mut upgrades.tortilla_spaceship),
        7 => Ok(&mut upgrades.satoshi_tacomoto),
        _ => Err(anyhow!("TORTILLA: invalid upgrade ID {id}")),
    }
}

pub fn get_upgrade_entry_by_id<'a>(
    upgrades: &'a SchemaUserUpgradesView,
    id: u8,
) -> Result<&'a SchemaUserUpgradesEntry> {
    match id {
        0 => Ok(&upgrades.taquero),
        1 => Ok(&upgrades.salsa_bar),
        2 => Ok(&upgrades.tortilla_tree),
        3 => Ok(&upgrades.tortilla_factory),
        4 => Ok(&upgrades.taco_submarine),
        5 => Ok(&upgrades.taco_pyramid),
        6 => Ok(&upgrades.tortilla_spaceship),
        7 => Ok(&upgrades.satoshi_tacomoto),
        _ => Err(anyhow!("TORTILLA: invalid upgrade ID {id}")),
    }
}
