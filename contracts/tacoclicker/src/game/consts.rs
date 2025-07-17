pub struct UpgradeSheetPriceEntry {
    pub id: u8,
    pub name: &'static str,
    pub base_cost: u128,
    pub weight: u128,
}
pub struct UpgradesSheetTable {
    pub taquero: UpgradeSheetPriceEntry,
    pub salsa_bar: UpgradeSheetPriceEntry,
    pub tortilla_tree: UpgradeSheetPriceEntry,
    pub tortilla_factory: UpgradeSheetPriceEntry,
    pub taco_submarine: UpgradeSheetPriceEntry,
    pub taco_pyramid: UpgradeSheetPriceEntry,
    pub tortilla_spaceship: UpgradeSheetPriceEntry,
    pub satoshi_tacomoto: UpgradeSheetPriceEntry,
}

pub const UPGRADES: UpgradesSheetTable = UpgradesSheetTable {
    taquero: UpgradeSheetPriceEntry {
        id: 0,
        name: "Taquero",
        base_cost: 10_000_000_000u128,
        weight: 1u128,
    },
    salsa_bar: UpgradeSheetPriceEntry {
        id: 1,
        name: "Salsa Bar",
        base_cost: 300_000_000_000u128,
        weight: 20u128,
    },
    tortilla_tree: UpgradeSheetPriceEntry {
        id: 2,
        name: "Tortilla Tree",
        base_cost: 2_500_000_000_000u128,
        weight: 300u128,
    },
    tortilla_factory: UpgradeSheetPriceEntry {
        id: 3,
        name: "Tortilla Factory",
        base_cost: 15_000_000_000_000u128,
        weight: 2_400u128,
    },
    taco_submarine: UpgradeSheetPriceEntry {
        id: 4,
        name: "Taco Bank",
        base_cost: 115_000_000_000_000u128,
        weight: 15_000u128,
    },
    taco_pyramid: UpgradeSheetPriceEntry {
        id: 5,
        name: "Taco Pyramid",
        base_cost: 500_000_000_000_000u128,
        weight: 60_000u128,
    },
    tortilla_spaceship: UpgradeSheetPriceEntry {
        id: 6,
        name: "Tortilla Spaceship",
        base_cost: 2_000_000_000_000_000u128,
        weight: 200_000u128,
    },
    satoshi_tacomoto: UpgradeSheetPriceEntry {
        id: 7,
        name: "Satoshi Tacomoto",
        base_cost: 10_000_000_000_000_000u128,
        weight: 1_000_000u128,
    },
};
