import * as bip39 from "bip39";
import { BIP32Factory, BIP32Interface } from "bip32";
import * as bitcoin from "bitcoinjs-lib";
import * as crypto from "crypto";
import { ecc } from "./ecc";
import { CURRENT_BTC_TICKER, NETWORK, setChosenWallet } from "@/consts";
import { EsploraUtxo } from "@/apis/esplora/types";
import { BoxedResponse, BoxedError, BoxedSuccess } from "@/boxed";
import { toXOnly } from "bitcoinjs-lib/src/psbt/bip371";
import { CHOSEN_WALLET } from "@/consts";
import { createHash } from "crypto";
import { esplora_getaddressbalance } from "../apis/esplora/index.js";
export const bip32 = BIP32Factory(ecc);

enum WalletError {
  IndexError = "IndexError",
}

export const getPath = (index?: number): string => {
  return `m/86'/0'/0'/0/${index ?? CHOSEN_WALLET}`;
}; // BIP86

//GLOBAL TYPES
export type WalletSigner = {
  root: BIP32Interface;
  xprv: BIP32Interface;
  xpub: BIP32Interface;
  seed: Buffer;
};

export type DecryptedWallet = {
  mnemonic: string;
  signer: WalletSigner;
};

export type EncryptedMnemonic = {
  kdf: string;
  cipher: string;
  salt: string;
  iv: string;
  tag: string;
  data: string;
};

export function getSigner(mnemonic: string): WalletSigner {
  const seed = bip39.mnemonicToSeedSync(mnemonic);
  const root = bip32.fromSeed(seed, NETWORK);

  if (!root) {
    throw new Error("Failed to create root key from seed");
  }

  const xprv = root.derivePath(getPath());
  const xpub = xprv.neutered();

  return { xprv, xpub, seed, root };
}

const sha256 = (m: Uint8Array) => createHash("sha256").update(m).digest();

export function signMessage(
  walletSigner: WalletSigner,
  message: string
): string {
  const taprootSigner = toTaprootSigner(walletSigner);

  if (!taprootSigner.signSchnorr) {
    throw new Error("Schnorr signing not supported by this signer");
  }

  return taprootSigner
    .signSchnorr(sha256(Buffer.from(message)))
    .toString("hex");
}

export const getPubKey = (signer: WalletSigner): Buffer => {
  const { root: rootKey } = signer;

  const childNode = rootKey.derivePath(getPath());
  const childNodeXOnlyPubkey = toXOnly(Buffer.from(childNode.publicKey));

  return Buffer.from(childNodeXOnlyPubkey);
};

export function toTaprootSigner(signer: WalletSigner) {
  const { root: rootKey } = signer;

  const childNode = rootKey.derivePath(getPath());
  const childNodeXOnlyPubkey = toXOnly(Buffer.from(childNode.publicKey));

  const tweakedChildNode = childNode.tweak(
    bitcoin.crypto.taggedHash("TapTweak", childNodeXOnlyPubkey)
  );

  return {
    ...tweakedChildNode,
    publicKey: Buffer.from(tweakedChildNode.publicKey),
    sign: (message: Buffer) =>
      Buffer.from(tweakedChildNode.sign(Buffer.from(message))),
    signSchnorr: (message: Buffer) =>
      Buffer.from(tweakedChildNode.signSchnorr(Buffer.from(message))),
  } as bitcoin.Signer;
}

export function getWitnessUtxo(utxo: EsploraUtxo, signer: WalletSigner) {
  const { root: rootKey } = signer;

  const childNode = rootKey.derivePath(getPath());

  const childNodeXOnlyPubkey = toXOnly(Buffer.from(childNode.publicKey));

  const { address, output, signature, pubkey } = bitcoin.payments.p2tr({
    internalPubkey: Buffer.from(childNodeXOnlyPubkey),
    network: NETWORK,
  });

  if (!pubkey) throw new Error("Failed to derive p2tr output script");

  if (!output) {
    throw new Error("Failed to derive p2tr output script");
  }

  return {
    hash: utxo.txid,
    index: utxo.vout,
    witnessUtxo: {
      script: pubkey,
      value: utxo.value,
    },
    tapInternalKey: Buffer.from(childNodeXOnlyPubkey),
  };
}

export const getTapInternalKey = (signer: WalletSigner) => {
  const { root: rootKey } = signer;
  const childNode = rootKey.derivePath(getPath());
  const childNodeXOnlyPubkey = toXOnly(Buffer.from(childNode.publicKey));

  return Buffer.from(childNodeXOnlyPubkey);
};

export function getCurrentTaprootAddress(
  signer: WalletSigner,
  index?: number
): string {
  const rootKey = signer.root;

  const childNode = rootKey.derivePath(getPath(index ?? CHOSEN_WALLET));

  const childNodeXOnlyPubkey = toXOnly(Buffer.from(childNode.publicKey));

  const { address } = bitcoin.payments.p2tr({
    internalPubkey: childNodeXOnlyPubkey,
    network: NETWORK,
  });
  if (!address) throw new Error("failed to derive p2tr address");
  return address;
}

// ––––– helper: simple AES‑256‑GCM encryption ––––– //
export function encryptMnemonic(
  mnemonic: string,
  password: string
): EncryptedMnemonic {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(password, salt, 32); // KDF
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(mnemonic, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return {
    kdf: "scrypt",
    cipher: "aes-256-gcm",
    salt: salt.toString("hex"),
    iv: iv.toString("hex"),
    tag: tag.toString("hex"),
    data: ciphertext.toString("hex"),
  };
}

export function decryptWalletWithPassword(
  encrypted: EncryptedMnemonic,
  password: string
): DecryptedWallet {
  const salt = Buffer.from(encrypted.salt, "hex");
  const key = crypto.scryptSync(password, salt, 32);
  const iv = Buffer.from(encrypted.iv, "hex");
  const tag = Buffer.from(encrypted.tag, "hex");
  const data = Buffer.from(encrypted.data, "hex");

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);

  return {
    mnemonic: decrypted.toString("utf8"),
    signer: getSigner(decrypted.toString("utf8")),
  };
}

export const getCurrentTaprootAddressFromWallet = (
  walletJson: SavedWallet,
  password: string
): string => {
  const { encryptedMnemonic, currentWalletIndex } = walletJson;
  const decrypted = decryptWalletWithPassword(encryptedMnemonic, password);
  const { signer } = decrypted;
  return getCurrentTaprootAddress(signer, currentWalletIndex);
};

export type SavedWallet = {
  encryptedMnemonic: EncryptedMnemonic;
  currentWalletIndex: number;
  generatedIndex: number;
};

export async function isValidMnemonic(mnemonic: string): Promise<boolean> {
  try {
    const isValid = await bip39.validateMnemonic(mnemonic);
    return isValid;
  } catch (err: unknown) {
    return false;
  }
}

export function switchWallet(
  walletJson: SavedWallet,
  password: string,
  index: number
): BoxedResponse<DecryptedWallet & { walletJson: SavedWallet }, WalletError> {
  const { currentWalletIndex, generatedIndex } = walletJson;
  if (index === currentWalletIndex) {
    return new BoxedError(WalletError.IndexError, "Already at this index");
  }
  if (index > generatedIndex + 1) {
    return new BoxedError(
      WalletError.IndexError,
      "Can only create one wallet at a time"
    );
  }

  if (index < 0) {
    return new BoxedError(WalletError.IndexError, "Index cannot be negative");
  }

  const decryptedWallet = decryptWalletWithPassword(
    walletJson.encryptedMnemonic,
    password
  );
  const { mnemonic, signer } = decryptedWallet;

  setChosenWallet(index);

  return new BoxedSuccess({
    mnemonic,
    signer: signer,
    walletJson: {
      ...walletJson,
      currentWalletIndex: index,
      generatedIndex: index > generatedIndex ? index : generatedIndex,
      currentAddress: getCurrentTaprootAddress(signer),
    },
  });
}

type BalanceEntry = {
  address: string;
  btc_balance: number;
};

export const viewAddresses = async (
  signer: WalletSigner,
  walletJson: SavedWallet
): Promise<BalanceEntry[]> => {
  const { generatedIndex } = walletJson;
  const balance: BalanceEntry[] = [];

  for (let i = 0; i <= generatedIndex; i++) {
    let address = getCurrentTaprootAddress(signer, i);

    let btcBalanceResponse = await esplora_getaddressbalance(address);

    if (btcBalanceResponse.status === false) {
      throw new Error(
        `Failed to fetch ${CURRENT_BTC_TICKER} balance: ${btcBalanceResponse.message}`
      );
    }
    let btcBalance = btcBalanceResponse.data;

    balance.push({ address, btc_balance: btcBalance ?? 0 });
  }

  return balance;
};

export async function generateWallet(opts: {
  from_mnemonic?: string;
  password: string;
}): Promise<
  BoxedResponse<DecryptedWallet & { walletJson: SavedWallet }, WalletError>
> {
  const mnemonic = opts.from_mnemonic ?? bip39.generateMnemonic(128);
  try {
    const signer = getSigner(mnemonic);
    return new BoxedSuccess({
      mnemonic,
      signer: signer,
      walletJson: {
        encryptedMnemonic: encryptMnemonic(mnemonic, opts.password),
        currentWalletIndex: 0,
        generatedIndex: 0,
      },
    });
  } catch (err: unknown) {
    if (err instanceof Error) {
      return new BoxedError(WalletError.InvalidMnemonic, err.message);
    } else {
      return new BoxedError(WalletError.InvalidMnemonic, "Invalid mnemonic");
    }
  }
}

enum WalletError {
  InvalidMnemonic = "InvalidMnemonic",
}
