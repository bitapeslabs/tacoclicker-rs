use anyhow::{anyhow, Result};
use bitcoin::Network;
//1.5m
pub const TORTILLA_AIRDROP_PREMINE: u128 = 150_000_000_000_000;

pub struct MerkleRoots {
    pub regtest: [u8; 32],
    pub mainnet: [u8; 32],
}

pub const MERKLE_ROOTS: MerkleRoots = MerkleRoots {
    regtest: [
        0xf7, 0x17, 0xf3, 0x36, 0x53, 0x51, 0x9d, 0xc9, 0x6c, 0x02, 0x3b, 0xd6, 0xe6, 0x12, 0x3c,
        0xcc, 0x47, 0x27, 0x55, 0xa0, 0x1e, 0xed, 0x33, 0x3b, 0x08, 0x62, 0x7a, 0x86, 0x85, 0xdb,
        0xfc, 0xfa,
    ],
    mainnet: [
        0x86, 0x1d, 0xc8, 0x24, 0x7b, 0x53, 0x6f, 0x73, 0x66, 0xe8, 0x1b, 0x3a, 0xbe, 0xcb, 0xb7,
        0xbe, 0xb7, 0x0b, 0x97, 0x70, 0x4d, 0xea, 0xbe, 0xe3, 0xc2, 0x83, 0xa7, 0x17, 0x13, 0x04,
        0x1a, 0x18,
    ],
};

pub const TORTILLA_CLAIM_WINDOW: u64 = 1440_u64;

//15,000 TORTILLA per block with precision of 8
pub const TORTILLA_PER_BLOCK: u128 = 1_500_000_000_000;

//every 144 blocks, someone will win 216,000 tortilla... 10% of the ENTIRE DAILY tortilla production of the game.
pub const SALSA_BLOCK_REWARD: u128 = 21_600_000_000_000;

//Amount people must pay to funding address to register
pub const FUNDING_PRICE_SATS: u64 = 21_000;

//My address for the monis
pub const FUNDING_ADDRESS: &str =
    "bcrt1pluksgqq4kf0kwu3unj00p4mla3xk7tq5ay49wnewt8eydmq22mhsn4qdaw";

//Constants so initialize doesnt need to be supplied with anything
pub const TOKEN_NAME: &str = "TORTILLA";
pub const TOKEN_SYMBOL: &str = "TORTILLA";

pub const DEPLOYMENT_NETWORK: Network = Network::Regtest;

pub fn get_merkle_root_from_id(id: u8) -> Result<[u8; 32]> {
    match id {
        0 => Ok(MERKLE_ROOTS.regtest),
        1 => Ok(MERKLE_ROOTS.mainnet),
        _ => Err(anyhow!(
            "Invalid network ID: must be 0 (regtest) or 1 (mainnet)"
        )),
    }
}
