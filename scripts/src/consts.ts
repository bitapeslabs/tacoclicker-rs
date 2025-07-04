import * as bitcoin from "bitcoinjs-lib";
import fs from "fs";
import { Provider } from "tacoclicker-sdk";
import { EncryptedMnemonic, encryptMnemonic } from "./crypto/wallet";

if (
  !process.env.BOYL_WALLET_PATH ||
  !process.env.BOYL_WALLET_PASSWORD ||
  !process.env.BOYL_WALLET_INDEX
) {
  throw new Error(
    "BOYL wallet configurations are incomplete. Please set BOYL_WALLET_PATH, BOYL_WALLET_PASSWORD, and BOYL_WALLET_INDEX in your environment variables."
  );
}

export const walletData = {
  encryptedMnemonic: JSON.parse(
    fs.readFileSync(process.env.BOYL_WALLET_PATH, "utf-8")
  ).encryptedMnemonic as EncryptedMnemonic,
  password: process.env.BOYL_WALLET_PASSWORD || "",
  index: process.env.BOYL_WALLET_INDEX || "0",
};

export const providers = {
  boylnet: new Provider({
    sandshrewUrl: "https://boynet.mezcal.sh/sandshrew",
    electrumApiUrl: "https://boynet.mezcal.sh/esplora",
    network: bitcoin.networks.regtest,
    explorerUrl: "https://boynet.mezcal.sh",
    defaultFeeRate: 5, // Default fee rate in sat/vbyte
  }),
};

if (!process.env.NETWORK) {
  console.warn(
    "NETWORK environment variable is not set. Defaulting to 'boylnet'."
  );
}
if (!providers[(process.env.NETWORK as keyof typeof providers) ?? "boylnet"]) {
  throw new Error(
    `Network ${
      process.env.NETWORK
    } is not supported. Available networks: ${Object.keys(providers).join(
      ", "
    )}`
  );
}

export const provider =
  providers[(process.env.NETWORK as keyof typeof providers) ?? "boylnet"];
