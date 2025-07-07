import * as bitcoin from "bitcoinjs-lib";
import { ecc } from "@/crypto/ecc";
import { BIP32Factory } from "bip32";
const bip32 = BIP32Factory(ecc);
import * as bip39 from "bip39";
import * as dotenv from "dotenv";
import {
  HDPaths,
  MnemonicToAccountOptions,
  IAccount,
  IAddressKey,
  WalletStandard,
} from "./types";

dotenv.config();

const makeHdPaths = (
  index: number,
  network: bitcoin.Network,
  overrides?: HDPaths
) => {
  const base = getHDPaths(index, network); // always full
  return {
    legacy: overrides?.legacy ?? base.legacy,
    nestedSegwit: overrides?.nestedSegwit ?? base.nestedSegwit,
    nativeSegwit: overrides?.nativeSegwit ?? base.nativeSegwit,
    taproot: overrides?.taproot ?? base.taproot,
  };
};
const buf = (u: Uint8Array): Buffer => Buffer.from(u);
const toXOnly = (pub: Buffer) => (pub.length === 32 ? pub : pub.slice(1, 33));

export const generateMnemonic = (bitsize?: 128 | 256) => {
  if (bitsize && bitsize !== 128 && bitsize !== 256) {
    throw new Error("Bitsize must be either 128 or 256");
  }
  return bitsize === 256
    ? bip39.generateMnemonic(256)
    : bip39.generateMnemonic();
};

export const validateMnemonic = (mnemonic: string) => {
  return bip39.validateMnemonic(mnemonic);
};

export const mnemonicToAccount = ({
  mnemonic = generateMnemonic(),
  opts,
}: {
  mnemonic?: string;
  opts?: MnemonicToAccountOptions;
}): IAccount => {
  const options = {
    network: opts?.network ? opts.network : bitcoin.networks.bitcoin,
    index: opts?.index ? opts.index : 0,
    hdPaths: opts?.hdPaths,
    spendStrategy: {
      addressOrder: opts?.spendStrategy?.addressOrder
        ? opts.spendStrategy.addressOrder
        : ([
            "nativeSegwit",
            "nestedSegwit",
            "legacy",
            "taproot",
          ] as IAddressKey[]),
      utxoSortGreatestToLeast:
        opts?.spendStrategy?.utxoSortGreatestToLeast !== undefined
          ? opts.spendStrategy.utxoSortGreatestToLeast
          : true,
      changeAddress: opts?.spendStrategy?.changeAddress
        ? opts?.spendStrategy?.changeAddress
        : "nativeSegwit",
    },
  };

  return generateWallet({
    mnemonic,
    opts: options,
  });
};

export const getHDPaths = (
  index: number = 0,
  network = bitcoin.networks.bitcoin,
  walletStandard: WalletStandard = "bip44_account_last"
): HDPaths => {
  const coinType = network === bitcoin.networks.testnet ? "1" : "0";

  switch (walletStandard) {
    case "bip44_standard":
      return {
        legacy: `m/44'/${coinType}'/${index}'/0/0`,
        nestedSegwit: `m/49'/${coinType}'/${index}'/0/0`,
        nativeSegwit: `m/84'/${coinType}'/${index}'/0/0`,
        taproot: `m/86'/${coinType}'/${index}'/0/0`,
      };

    case "bip32_simple":
      return {
        legacy: `m/44'/${coinType}'/${index}'/0`,
        nestedSegwit: `m/49'/${coinType}'/${index}'/0`,
        nativeSegwit: `m/84'/${coinType}'/${index}'/0`,
        taproot: `m/86'/${coinType}'/${index}'/0`,
      };

    case "bip44_account_last":
    default:
      return {
        legacy: `m/44'/${coinType}'/0'/0/${index}`,
        nestedSegwit: `m/49'/${coinType}'/0'/0/${index}`,
        nativeSegwit: `m/84'/${coinType}'/0'/0/${index}`,
        taproot: `m/86'/${coinType}'/0'/0/${index}`,
      };
  }
};
export const generateWallet = ({
  mnemonic,
  opts,
}: {
  mnemonic?: string;
  opts: MnemonicToAccountOptions;
}): IAccount => {
  if (!mnemonic) throw new Error("mnemonic not given");

  const hdPaths = { ...getHDPaths(opts.index, opts.network), ...opts.hdPaths };
  const seed = bip39.mnemonicToSeedSync(mnemonic);
  const root = bip32.fromSeed(seed);

  /* ---------- Legacy (P2PKH) ---------- */
  if (!hdPaths.legacy) {
    throw new Error("Legacy HD path is not defined in options");
  }
  const childLegacy = root.derivePath(hdPaths.legacy);
  const pubkeyLegacyBuf = buf(childLegacy.publicKey);
  const legacyPay = bitcoin.payments.p2pkh({
    pubkey: pubkeyLegacyBuf,
    network: opts.network,
  });
  const legacy = {
    pubkey: pubkeyLegacyBuf.toString("hex"),
    address: legacyPay.address!, // ‹— non-null assertion
    hdPath: hdPaths.legacy!,
  };

  /* ---------- Nested SegWit (P2SH-P2WPKH) ---------- */
  if (!hdPaths.nestedSegwit) {
    throw new Error("Nested SegWit HD path is not defined in options");
  }
  const childNested = root.derivePath(hdPaths.nestedSegwit);
  const pubNestedBuf = buf(childNested.publicKey);
  const nestedPay = bitcoin.payments.p2sh({
    redeem: bitcoin.payments.p2wpkh({
      pubkey: pubNestedBuf,
      network: opts.network,
    }),
  });
  const nestedSegwit = {
    pubkey: pubNestedBuf.toString("hex"),
    address: nestedPay.address!,
    hdPath: hdPaths.nestedSegwit!,
  };

  /* ---------- Native SegWit (P2WPKH) ---------- */
  if (!hdPaths.nativeSegwit) {
    throw new Error("Native SegWit HD path is not defined in options");
  }
  const childNative = root.derivePath(hdPaths.nativeSegwit);
  const pubNativeBuf = buf(childNative.publicKey);
  const nativePay = bitcoin.payments.p2wpkh({
    pubkey: pubNativeBuf,
    network: opts.network,
  });
  const nativeSegwit = {
    pubkey: pubNativeBuf.toString("hex"),
    address: nativePay.address!,
    hdPath: hdPaths.nativeSegwit!,
  };

  /* ---------- Taproot (P2TR) ---------- */
  if (!hdPaths.taproot) {
    throw new Error("Taproot HD path is not defined in options");
  }
  const childTaproot = root.derivePath(hdPaths.taproot);
  const pubTapBuf = buf(childTaproot.publicKey);
  const pubXOnly = toXOnly(pubTapBuf);
  const tapPay = bitcoin.payments.p2tr({
    internalPubkey: pubXOnly,
    network: opts.network,
  });
  const taproot = {
    pubkey: pubTapBuf.toString("hex"),
    pubKeyXOnly: pubXOnly.toString("hex"),
    address: tapPay.address!,
    hdPath: hdPaths.taproot!,
  };

  return {
    taproot,
    nativeSegwit,
    nestedSegwit,
    legacy,
    spendStrategy: opts.spendStrategy!,
    network: opts.network!,
  };
};

/* ------------------------------------------------------------------ *
 *  getWalletPrivateKeys – same Buffer fixes                           *
 * ------------------------------------------------------------------ */
export const getWalletPrivateKeys = ({
  mnemonic,
  opts,
}: {
  mnemonic: string;
  opts?: MnemonicToAccountOptions;
}) => {
  const { network = bitcoin.networks.bitcoin, index = 0 } = opts ?? {};
  const hdPaths = { ...getHDPaths(index, network), ...opts?.hdPaths };
  const seed = bip39.mnemonicToSeedSync(mnemonic);
  const root = bip32.fromSeed(seed);

  const deriveHex = (path: string) =>
    Buffer.from(root.derivePath(path).privateKey!).toString("hex");

  return {
    taproot: { privateKey: deriveHex(hdPaths.taproot!) },
    nativeSegwit: { privateKey: deriveHex(hdPaths.nativeSegwit!) },
    nestedSegwit: { privateKey: deriveHex(hdPaths.nestedSegwit!) },
    legacy: { privateKey: deriveHex(hdPaths.legacy!) },
  };
};
