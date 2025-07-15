import { getOylAccountFromSigner } from "../oyl";
import * as bip39 from "bip39";
import { BIP32Factory, BIP32Interface } from "bip32";
import * as bitcoin from "bitcoinjs-lib";
import * as crypto from "crypto";
import { ecc } from "@/crypto/ecc";
import { walletData, provider, getPath } from "@/consts";
import { EsploraUtxo } from "tacoclicker-sdk";
import { BoxedResponse, BoxedError, BoxedSuccess } from "@/boxed";
import { toXOnly } from "bitcoinjs-lib/src/psbt/bip371";
import { createHash } from "crypto";
import { IAccount } from "@/libs/alkanes/account/types";
import { EncryptedMnemonic, WalletSigner, DecryptedWallet } from "./types";
import { ECPairInterface, ECPairFactory } from "ecpair";

export const bip32 = BIP32Factory(ecc);
export const ECPair = ECPairFactory(ecc);

export function getSigner(mnemonic: string): WalletSigner {
  const seed = bip39.mnemonicToSeedSync(mnemonic);
  const root = bip32.fromSeed(seed, provider.network);

  if (!root) {
    throw new Error("Failed to create root key from seed");
  }

  const xprv = root.derivePath(getPath());
  const xpub = xprv.neutered();

  return { xprv, xpub, seed, root };
}

const sha256 = (m: Uint8Array) => createHash("sha256").update(m).digest();

export function signMessage(walletSigner: WalletSigner, message: string): string {
  const taprootSigner = toTaprootSigner(walletSigner);

  if (!taprootSigner.signSchnorr) {
    throw new Error("Schnorr signing not supported by this signer");
  }

  return taprootSigner.signSchnorr(sha256(Buffer.from(message))).toString("hex");
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

  const tweakedChildNode = childNode.tweak(bitcoin.crypto.taggedHash("TapTweak", childNodeXOnlyPubkey));

  return {
    ...tweakedChildNode,
    publicKey: Buffer.from(tweakedChildNode.publicKey),
    sign: (message: Buffer) => Buffer.from(tweakedChildNode.sign(Buffer.from(message))),
    signSchnorr: (message: Buffer) => Buffer.from(tweakedChildNode.signSchnorr(Buffer.from(message))),
  } as bitcoin.Signer;
}

export function getWitnessUtxo(utxo: EsploraUtxo, signer: WalletSigner) {
  const { root: rootKey } = signer;

  const childNode = rootKey.derivePath(getPath());

  const childNodeXOnlyPubkey = toXOnly(Buffer.from(childNode.publicKey));

  const { address, output, signature, pubkey } = bitcoin.payments.p2tr({
    internalPubkey: Buffer.from(childNodeXOnlyPubkey),
    network: provider.network,
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

export function getCurrentTaprootAddress(signer: WalletSigner): string {
  const rootKey = signer.root;

  const childNode = rootKey.derivePath(getPath());

  const childNodeXOnlyPubkey = toXOnly(Buffer.from(childNode.publicKey));

  const { address } = bitcoin.payments.p2tr({
    internalPubkey: childNodeXOnlyPubkey,
    network: provider.network,
  });
  if (!address) throw new Error("failed to derive p2tr address");
  return address;
}

// ––––– helper: simple AES‑256‑GCM encryption ––––– //
export function encryptMnemonic(mnemonic: string, password: string): EncryptedMnemonic {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(password, salt, 32); // KDF
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(mnemonic, "utf8"), cipher.final()]);
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

export const getTaprootWalletSigner = (): DecryptedWallet => {
  const encryptedMnemonic = walletData.encryptedMnemonic;

  const password = walletData.password;

  const decrypted = decryptWalletWithPassword(encryptedMnemonic, password);
  return decrypted;
};

type BrowserLikeWalletSigner = {
  oyl: IAccount;
  signer: WalletSigner;
  ecsigner: ECPairInterface;
  signPsbt: (unsignedPsbtBase64: string) => Promise<string>;
  address: string;
};
export function ecPairFromWalletSigner(
  signer: WalletSigner,
  network: bitcoin.networks.Network = bitcoin.networks.bitcoin
): ECPairInterface {
  if (!signer.xprv.privateKey) {
    throw new Error("xprv does not contain a private key");
  }

  return ECPair.fromPrivateKey(Buffer.from(signer.xprv.privateKey), {
    network,
  });
}
export async function signPsbt(base64Psbt: string, walletSigner: WalletSigner): Promise<string> {
  try {
    const psbt = bitcoin.Psbt.fromBase64(base64Psbt, {
      network: provider.network,
    });

    const signer = toTaprootSigner(walletSigner);

    for (let i = 0; i < psbt.inputCount; i++) {
      const input = psbt.data.inputs[i];

      // Skip inputs already finalized (have finalScriptWitness or finalScriptSig)
      if (input.finalScriptWitness || input.finalScriptSig) {
        continue;
      }

      psbt.signInput(i, signer);
      psbt.finalizeInput(i);
    }

    return psbt.extractTransaction().toHex();
  } catch (error) {
    console.error("Error signing PSBT:", error);
    throw new Error("Failed to sign PSBT");
  }
}

const taprootDecryptedWallet = getTaprootWalletSigner();

export const walletSigner: BrowserLikeWalletSigner = {
  oyl: getOylAccountFromSigner(taprootDecryptedWallet.signer, provider),
  signer: taprootDecryptedWallet.signer,
  ecsigner: ecPairFromWalletSigner(taprootDecryptedWallet.signer),
  signPsbt: (unsignedPsbtBase64: string) => signPsbt(unsignedPsbtBase64, taprootDecryptedWallet.signer),
  address: getCurrentTaprootAddress(taprootDecryptedWallet.signer),
};

export function decryptWalletWithPassword(encrypted: EncryptedMnemonic, password: string): DecryptedWallet {
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

export async function isValidMnemonic(mnemonic: string): Promise<boolean> {
  try {
    const isValid = await bip39.validateMnemonic(mnemonic);
    return isValid;
  } catch (err: unknown) {
    return false;
  }
}
