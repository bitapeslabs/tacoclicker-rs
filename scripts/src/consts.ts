import * as bitcoin from "bitcoinjs-lib";
import * as tacoclickerLib from "tacoclicker-sdk";
import * as alkanesLib from "@/libs/alkanes";
import { walletData, NETWORK } from "./env"; // ← new
import { TaskLogger } from "@/libs/utils/logger";
import { ecc } from "./crypto/ecc";
bitcoin.initEccLib(ecc);

/* providers ------------------------------------------------------------- */
export const providers = {
  boylnet: new tacoclickerLib.Provider({
    sandshrewUrl: "https://boynet.mezcal.sh/sandshrew",
    electrumApiUrl: "https://boynet.mezcal.sh/esplora",
    network: bitcoin.networks.regtest,
    explorerUrl: "https://boynet.mezcal.sh",
    defaultFeeRate: 5,
  }),
};

export const oylProviders = {
  boylnet: new alkanesLib.OylProvider({
    url: "https://boynet.mezcal.sh/sandshrew",
    projectId: "",
    version: "",
    network: bitcoin.networks.regtest,
    networkType: "regtest",
  }),
};

if (!providers[NETWORK as keyof typeof providers]) {
  throw new Error(
    `Network "${NETWORK}" not supported. Available: ${Object.keys(providers)}`
  );
}

export const provider = providers[NETWORK as keyof typeof providers];
export const oylProvider = oylProviders[NETWORK as keyof typeof oylProviders];
export const taskLogger = new TaskLogger();
export { walletData };
export const getPath = (): string => {
  return `m/86'/0'/0'/0/${walletData.index}`;
}; // BIP86
