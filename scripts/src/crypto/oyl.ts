import * as bitcoin from "bitcoinjs-lib";
import { toXOnly } from "bitcoinjs-lib/src/psbt/bip371";
import { Account, SpendStrategy } from "tacoclicker-sdk";
import { Provider } from "tacoclicker-sdk";
import type { BIP32Interface } from "bip32";
import { Signer as OylSigner } from "@/libs/alkanes";
import { provider, getPath, walletData } from "@/consts";
import { AlkanesPayload } from "@/libs/alkanes/shared/types";
import { gzip as _gzip } from "zlib";
import { promisify } from "util";
import { encipher, encodeRunestoneProtostone, ProtoStone } from "alkanes";
import fs from "fs/promises";
import path from "path";
import { WalletSigner } from "./wallet/types";

const makePath = (purpose: number, idx: number) =>
  `m/${purpose}'/0'/0'/0/${idx}`;

export const getOylAccountFromSigner = (
  signer: WalletSigner,
  provider: Provider
): Account => {
  const { root } = signer;

  const derive = (purpose: number) => {
    const hdPath = makePath(purpose, Number(walletData.index));
    const node = root.derivePath(hdPath);
    return { node, hdPath };
  };

  const taprootNode = derive(86); // BIP-86
  const nativeSegwitNode = derive(84); // BIP-84
  const nestedSegwitNode = derive(49); // BIP-49
  const legacyNode = derive(44); // BIP-44

  const tapXOnly = toXOnly(Buffer.from(taprootNode.node.publicKey));
  const tapPay = bitcoin.payments.p2tr({
    internalPubkey: tapXOnly,
    network: provider.network,
  });

  const segwitPay = bitcoin.payments.p2wpkh({
    pubkey: Buffer.from(nativeSegwitNode.node.publicKey),
    network: provider.network,
  });

  const nestedRedeem = bitcoin.payments.p2wpkh({
    pubkey: Buffer.from(nestedSegwitNode.node.publicKey),
    network: provider.network,
  });
  const nestedPay = bitcoin.payments.p2sh({
    redeem: nestedRedeem,
    network: provider.network,
  });

  const legacyPay = bitcoin.payments.p2pkh({
    pubkey: Buffer.from(legacyNode.node.publicKey),
    network: provider.network,
  });

  const spendStrategy: SpendStrategy = {
    addressOrder: ["taproot", "nativeSegwit", "nestedSegwit", "legacy"],
    utxoSortGreatestToLeast: true,
    changeAddress: "taproot",
  };

  return {
    taproot: {
      pubkey: Buffer.from(taprootNode.node.publicKey).toString("hex"),
      pubKeyXOnly: Buffer.from(tapXOnly).toString("hex"),
      address: tapPay.address as string,
      hdPath: taprootNode.hdPath,
    },
    nativeSegwit: {
      pubkey: Buffer.from(nativeSegwitNode.node.publicKey).toString("hex"),
      address: segwitPay.address as string,
      hdPath: nativeSegwitNode.hdPath,
    },
    nestedSegwit: {
      pubkey: Buffer.from(nestedSegwitNode.node.publicKey).toString("hex"),
      address: nestedPay.address as string,
      hdPath: nestedSegwitNode.hdPath,
    },
    legacy: {
      pubkey: Buffer.from(legacyNode.node.publicKey).toString("hex"),
      address: legacyPay.address as string,
      hdPath: legacyNode.hdPath,
    },
    spendStrategy,
    network: provider.network,
  };
};

export const getOylSignerFromWalletSigner = (
  walletSigner: WalletSigner
): OylSigner => {
  const { root } = walletSigner;

  const deriveWif = (purpose: number): string => {
    const node = root.derivePath(getPath());
    if (!node.privateKey)
      throw new Error(`Could not derive private key at m/${purpose}'/…`);
    return Buffer.from(node.privateKey).toString("hex");
  };

  const keys = {
    taprootPrivateKey: deriveWif(86),
    segwitPrivateKey: deriveWif(84),
    nestedSegwitPrivateKey: deriveWif(49),
    legacyPrivateKey: deriveWif(44),
  };

  return new OylSigner(provider.network, keys);
};

export interface AlkanesDeploymentParams {
  contract: Uint8Array;
  payload: AlkanesPayload;
  protostone: Uint8Array;
  callData: bigint[];
}

const gzip = promisify(_gzip);

export async function getAlkanesDeploymentParamsFromWasmPath(
  wasmPath: string,
  callData: bigint[]
): Promise<AlkanesDeploymentParams> {
  const contract = new Uint8Array(
    await fs.readFile(path.resolve(process.cwd(), wasmPath))
  );
  const payload: AlkanesPayload = {
    body: await gzip(contract, { level: 9 }),
    cursed: false,
    tags: { contentType: "" }, // set if you want MIME-style tagging
  };

  const protostone = encodeRunestoneProtostone({
    protostones: [
      ProtoStone.message({
        protocolTag: 1n,
        edicts: [],
        pointer: 0,
        refundPointer: 0,
        calldata: encipher(callData),
      }),
    ],
  }).encodedRunestone;

  return { contract, payload, protostone, callData };
}
