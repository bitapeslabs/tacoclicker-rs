import { regtest } from "bitcoinjs-lib/src/networks";
import fs from "fs";
import path from "path";
import envPaths from "env-paths";
import { Provider } from "@/libs/alkanes";

export const DEFAULT_ERROR = "An unknown error occurred";

export const DEFAULT_FEE_RATE = 10;

export const ELECTRUM_API_URL = "https://boylnet.mezcal.sh/esplora";
export const EXPLORER_URL = "https://boylnet.mezcal.sh";
export const CURRENT_BTC_TICKER = "rBTC";
export const NETWORK = regtest; // Signet uses the testnet network configuration

//paths
const paths = envPaths("boyl");

fs.mkdirSync(paths.data, { recursive: true });
export const WALLET_PATH = path.resolve(paths.data, "wallet.json");

export const getChosenWallet = () => {
  if (!fs.existsSync(WALLET_PATH)) {
    return 0;
  }
  const walletJson = JSON.parse(fs.readFileSync(WALLET_PATH, "utf-8"));
  return walletJson.currentWalletIndex;
};
export let CHOSEN_WALLET = getChosenWallet();

export const setChosenWallet = (wallet: number) => {
  CHOSEN_WALLET = wallet;
};

export const ALKANES_PROVIDER = new Provider({
  url: "https://boylnet.mezcal.sh/sandshrew",
  projectId: "",
  version: "",
  network: NETWORK,
  networkType: "regtest",
});
