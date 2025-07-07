// src/env.ts – central place to read .env + wallet json
import fs from "fs";
import { EncryptedMnemonic } from "@/crypto/wallet/types";

if (
  !process.env.BOYL_WALLET_PATH ||
  !process.env.BOYL_WALLET_PASSWORD ||
  !process.env.BOYL_WALLET_INDEX
) {
  throw new Error(
    "Set BOYL_WALLET_PATH, BOYL_WALLET_PASSWORD and BOYL_WALLET_INDEX env vars."
  );
}

export const walletData = {
  encryptedMnemonic: JSON.parse(
    fs.readFileSync(process.env.BOYL_WALLET_PATH, "utf-8")
  ).encryptedMnemonic as EncryptedMnemonic,
  password: process.env.BOYL_WALLET_PASSWORD!,
  index: process.env.BOYL_WALLET_INDEX!,
};

export const NETWORK = process.env.NETWORK ?? "boylnet";
