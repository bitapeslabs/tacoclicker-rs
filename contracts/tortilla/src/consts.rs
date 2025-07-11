use bitcoin::Network;

//15,000 TORTILLA per block with precision of 8
pub const TORTILLA_PER_BLOCK: u128 = 1_500_000_000_000;

//Amount people must pay to funding address to register
pub const FUNDING_PRICE_SATS: u64 = 21_000;

//My address for the monis
pub const FUNDING_ADDRESS: &str =
    "bcrt1pluksgqq4kf0kwu3unj00p4mla3xk7tq5ay49wnewt8eydmq22mhsn4qdaw";

//Constants so initialize doesnt need to be supplied with anything
pub const TOKEN_NAME: &str = "TORTILLA";
pub const TOKEN_SYMBOL: &str = "TORTILLA";
pub const DEPLOYMENT_NETWORK: Network = Network::Regtest;
