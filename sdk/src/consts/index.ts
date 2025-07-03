// config.ts  ─────────────── 100 % native ESM, no top-level await
import * as boylnet from "./boylnet.js";
import * as mainnet from "./mainnet.js";

const AVAILABLE = {
  boylnet,
  mainnet,
} as const;

const chosen = (
  process.argv.slice(2).find((a) => `${a.replaceAll("--", "")}` in AVAILABLE) ??
  (() => {
    console.warn(
      "No network specified, defaulting to 'boylnet'. Use --boylnet or --mainnet to choose."
    );
    return "boylnet"; // default network
  })()
).replaceAll("--", "");

const cfg = AVAILABLE[chosen as keyof typeof AVAILABLE];

export const ALKANES_PROVIDER = cfg.ALKANES_PROVIDER;
export const WALLET_PATH = cfg.WALLET_PATH;
export const ELECTRUM_API_URL = cfg.ELECTRUM_API_URL;
export const EXPLORER_URL = cfg.EXPLORER_URL;
export const CURRENT_BTC_TICKER = cfg.CURRENT_BTC_TICKER;
export const NETWORK = cfg.NETWORK;
export const DEFAULT_ERROR = cfg.DEFAULT_ERROR;
export const getChosenWallet = cfg.getChosenWallet;
export const setChosenWallet = cfg.setChosenWallet;
export const CHOSEN_WALLET = cfg.CHOSEN_WALLET;
export const DEFAULT_FEE_RATE = cfg.DEFAULT_FEE_RATE;

export default cfg;
