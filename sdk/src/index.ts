import { ecc } from "./crypto/ecc";
import * as bitcoin from "bitcoinjs-lib";
bitcoin.initEccLib(ecc);

export * from "./libs";
export * from "./apis";
export * from "./provider";
export * from "./utils";
