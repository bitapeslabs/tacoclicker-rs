import * as bitcoin from "bitcoinjs-lib";
import { toXOnly } from "bitcoinjs-lib/src/psbt/bip371";
import { Account, SpendStrategy } from "tacoclicker-sdk";
import { Provider } from "tacoclicker-sdk";
import type { BIP32Interface } from "bip32";
import { walletData } from "@/consts";

export type WalletSigner = {
  root: BIP32Interface;
  xprv: BIP32Interface;
  xpub: BIP32Interface;
  seed: Buffer;
};

const makePath = (purpose: number, idx: number) =>
  `m/${purpose}'/0'/0'/0/${idx}`;

export const getOylAccountFromSigner = (
  signer: WalletSigner,
  provider: Provider
): Account => {
  const { root } = signer;

  const derive = (purpose: number) => {
    const hdPath = makePath(purpose, 0);
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

export const getOylSignerKeysFromWalletSigner = (
  walletSigner: WalletSigner
) => {
  const { root } = walletSigner; // BIP-32 master (xprv)

  /** Derive the WIF-encoded priv-key for a given BIP-purpose */
  const deriveWif = (purpose: number): string => {
    const node = root.derivePath(makePath(1, 0));
    if (!node.privateKey)
      throw new Error(`Could not derive private key at m/${purpose}'/…`);
    return Buffer.from(node.privateKey).toString("hex");
  };

  // Build the keys object expected by Oyl-SDK’s Signer
  const keys = {
    taprootPrivateKey: deriveWif(86), // BIP-86  (p2tr)
    segwitPrivateKey: deriveWif(84), // BIP-84  (p2wpkh)
    nestedSegwitPrivateKey: deriveWif(49), // BIP-49  (p2sh-p2wpkh)
    legacyPrivateKey: deriveWif(44), // BIP-44  (p2pkh)
  };

  // Hand everything to Oyl’s Signer
  return keys;
};
