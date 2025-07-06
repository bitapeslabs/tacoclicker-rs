import * as bitcoin from "bitcoinjs-lib";
import { ECPair, tweakSigner } from "./shared/utils";
import { type ECPairInterface } from "ecpair";
import { Signer as bipSigner } from "bip322-js";
import crypto from "crypto";

export type WalletInit = {
  segwitPrivateKey?: string;
  taprootPrivateKey?: string;
  legacyPrivateKey?: string;
  nestedSegwitPrivateKey?: string;
};

export enum SighashType {
  ALL = bitcoin.Transaction.SIGHASH_ALL,
  NONE = bitcoin.Transaction.SIGHASH_NONE,
  SINGLE = bitcoin.Transaction.SIGHASH_SINGLE,
  ANYONECANPAY = bitcoin.Transaction.SIGHASH_ANYONECANPAY,
  ALL_ANYONECANPAY = SighashType.ALL | SighashType.ANYONECANPAY,
  NONE_ANYONECANPAY = SighashType.NONE | SighashType.ANYONECANPAY,
  SINGLE_ANYONECANPAY = SighashType.SINGLE | SighashType.ANYONECANPAY,
}

export class Signer {
  readonly network: bitcoin.Network;

  /** These are optional because you may initialise only a subset */
  readonly segwitKeyPair?: ECPairInterface;
  readonly taprootKeyPair?: ECPairInterface;
  readonly legacyKeyPair?: ECPairInterface;
  readonly nestedSegwitKeyPair?: ECPairInterface;

  /** Keeping the raw keys around can be handy for later use */
  readonly addresses: WalletInit;

  constructor(network: bitcoin.Network, keys: WalletInit) {
    this.network = network;
    this.addresses = keys;

    if (keys.segwitPrivateKey) {
      this.segwitKeyPair = ECPair.fromPrivateKey(
        Buffer.from(keys.segwitPrivateKey, "hex")
      );
    }
    if (keys.taprootPrivateKey) {
      this.taprootKeyPair = ECPair.fromPrivateKey(
        Buffer.from(keys.taprootPrivateKey, "hex")
      );
    }
    if (keys.legacyPrivateKey) {
      this.legacyKeyPair = ECPair.fromPrivateKey(
        Buffer.from(keys.legacyPrivateKey, "hex")
      );
    }
    if (keys.nestedSegwitPrivateKey) {
      this.nestedSegwitKeyPair = ECPair.fromPrivateKey(
        Buffer.from(keys.nestedSegwitPrivateKey, "hex")
      );
    }
  }

  /* ------------------------------------------------------------------ *
   *  SINGLE-INPUT HELPERS                                              *
   * ------------------------------------------------------------------ */

  async signSegwitInput(params: {
    rawPsbt: string;
    inputNumber: number;
    finalize: boolean;
  }) {
    if (!this.segwitKeyPair) throw new Error("Segwit signer not initialised");

    const psbt = bitcoin.Psbt.fromBase64(params.rawPsbt, {
      network: this.network,
    });

    if (psbt.inputHasPubkey(params.inputNumber, this.segwitKeyPair.publicKey)) {
      psbt.signInput(params.inputNumber, this.segwitKeyPair);
      if (params.finalize) psbt.finalizeInput(params.inputNumber);
    }

    return { signedPsbt: psbt.toBase64() };
  }

  async signTaprootInput(params: {
    rawPsbt: string;
    inputNumber: number;
    finalize: boolean;
  }) {
    if (!this.taprootKeyPair) throw new Error("Taproot signer not initialised");

    const psbt = bitcoin.Psbt.fromBase64(params.rawPsbt, {
      network: this.network,
    });
    const tweaked = tweakSigner(this.taprootKeyPair);

    if (!psbt.inputHasPubkey(params.inputNumber, tweaked.publicKey)) {
      throw new Error("Input does not match signer type");
    }

    psbt.signTaprootInput(params.inputNumber, tweaked);
    if (params.finalize) psbt.finalizeInput(params.inputNumber);

    return { signedPsbt: psbt.toBase64() };
  }

  /* ------------------------------------------------------------------ *
   *  BULK SIGNING HELPERS                                              *
   * ------------------------------------------------------------------ */

  async signAllTaprootInputs(params: { rawPsbt: string; finalize: boolean }) {
    if (!this.taprootKeyPair) throw new Error("Taproot signer not initialised");

    const psbt = bitcoin.Psbt.fromBase64(params.rawPsbt, {
      network: this.network,
    });
    const tweaked = tweakSigner(this.taprootKeyPair);

    for (let i = 0; i < psbt.inputCount; i++) {
      if (!psbt.inputHasPubkey(i, tweaked.publicKey)) continue;

      psbt.signTaprootInput(i, tweaked);
      if (params.finalize) psbt.finalizeInput(i);
    }

    return {
      signedPsbt: psbt.toBase64(),
      signedHexPsbt: psbt.toHex(),
      raw: psbt,
    };
  }

  /**
   * Convenience: accept either Base64 or hex.  At least one is required.
   */
  async signAllInputs(params: {
    rawPsbt?: string;
    rawPsbtHex?: string;
    finalize?: boolean;
  }) {
    const { rawPsbt, rawPsbtHex, finalize = true } = params;

    const psbt = rawPsbt
      ? bitcoin.Psbt.fromBase64(rawPsbt, { network: this.network })
      : rawPsbtHex
      ? bitcoin.Psbt.fromHex(rawPsbtHex, { network: this.network })
      : (() => {
          throw new Error("Either rawPsbt or rawPsbtHex must be supplied");
        })();

    for (let i = 0; i < psbt.inputCount; i++) {
      /* ---------- initial state for this input ---------- */
      let tweaked: bitcoin.Signer | undefined;
      let matchingLegacy = false;
      let matchingNative = false;
      let matchingTaproot = false;
      let matchingNested = false;

      /* ---------- detect which key matches ---------- */
      if (this.taprootKeyPair) {
        tweaked = tweakSigner(this.taprootKeyPair, { network: this.network });
        matchingTaproot = psbt.inputHasPubkey(i, tweaked.publicKey);
      }
      if (this.legacyKeyPair) {
        matchingLegacy = psbt.inputHasPubkey(i, this.legacyKeyPair.publicKey);
      }
      if (this.segwitKeyPair) {
        matchingNative = psbt.inputHasPubkey(i, this.segwitKeyPair.publicKey);
      }
      if (this.nestedSegwitKeyPair) {
        matchingNested = psbt.inputHasPubkey(
          i,
          this.nestedSegwitKeyPair.publicKey
        );
      }

      /* ---------- honour explicit sighash if present ---------- */
      const sighash = psbt.data.inputs[i].sighashType;
      const allowedSighashTypes: number[] | undefined =
        typeof sighash === "number" ? [sighash] : undefined;

      /* ---------- sign with whichever key matched ---------- */
      if (matchingTaproot && tweaked) {
        psbt.signTaprootInput(i, tweaked);
      } else if (matchingLegacy && this.legacyKeyPair) {
        psbt.signInput(i, this.legacyKeyPair, allowedSighashTypes);
      } else if (matchingNative && this.segwitKeyPair) {
        psbt.signInput(i, this.segwitKeyPair, allowedSighashTypes);
      } else if (matchingNested && this.nestedSegwitKeyPair) {
        psbt.signInput(i, this.nestedSegwitKeyPair, allowedSighashTypes);
      }

      if (finalize) {
        try {
          psbt.finalizeInput(i);
        } catch {
          /* ignore inputs we didn’t sign */
        }
      }
    }

    return { signedPsbt: psbt.toBase64(), signedHexPsbt: psbt.toHex() };
  }

  async signAllSegwitInputs(params: { rawPsbt: string; finalize: boolean }) {
    if (!this.segwitKeyPair) throw new Error("Segwit signer not initialised");

    const psbt = bitcoin.Psbt.fromBase64(params.rawPsbt, {
      network: this.network,
    });

    for (let i = 0; i < psbt.inputCount; i++) {
      if (!psbt.inputHasPubkey(i, this.segwitKeyPair.publicKey)) continue;

      psbt.signInput(i, this.segwitKeyPair);
      if (params.finalize) psbt.finalizeInput(i);
    }

    return { signedPsbt: psbt.toBase64(), signedHexPsbt: psbt.toHex() };
  }

  /* ------------------------------------------------------------------ *
   *  MESSAGE SIGNING                                                   *
   * ------------------------------------------------------------------ */

  async signMessage(params: {
    message: string;
    protocol: "ecdsa" | "bip322";
    keypair: ECPairInterface;
    /** for BIP-322 you must provide the address you are proving ownership of */
    address?: string;
  }) {
    const { message, protocol, keypair, address } = params;

    if (protocol === "bip322") {
      if (!address) throw new Error("address is required for BIP-322 signing");
      return Buffer.from(
        bipSigner.sign(keypair.toWIF(), address, message)
      ).toString("base64");
    }

    /* default to plain ECDSA */
    const hash = crypto.createHash("sha256").update(message).digest();
    return keypair.sign(hash).toString("base64");
  }
}
