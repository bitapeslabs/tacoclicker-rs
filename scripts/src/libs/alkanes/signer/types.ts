import * as bitcoin from "bitcoinjs-lib";
import { ECPairInterface } from "ecpair";

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

export interface ISigner {
  /** Bitcoin network (mainnet, testnet, regtest, etc) */
  readonly network: bitcoin.Network;

  /** Optional keypairs for different address types */
  readonly segwitKeyPair?: ECPairInterface;
  readonly taprootKeyPair?: ECPairInterface;
  readonly legacyKeyPair?: ECPairInterface;
  readonly nestedSegwitKeyPair?: ECPairInterface;

  /** Raw address + key state from constructor */
  readonly addresses: WalletInit;

  /** Sign a single segwit input */
  signSegwitInput(params: {
    rawPsbt: string;
    inputNumber: number;
    finalize: boolean;
  }): Promise<{ signedPsbt: string }>;

  /** Sign a single taproot input */
  signTaprootInput(params: {
    rawPsbt: string;
    inputNumber: number;
    finalize: boolean;
  }): Promise<{ signedPsbt: string }>;

  /** Sign all inputs with Taproot key (if available) */
  signAllTaprootInputs(params: {
    rawPsbt: string;
    finalize: boolean;
  }): Promise<{
    signedPsbt: string;
    signedHexPsbt: string;
    raw: bitcoin.Psbt;
  }>;

  /** Auto-detect and sign all inputs with available key types */
  signAllInputs(params: {
    rawPsbt?: string;
    rawPsbtHex?: string;
    finalize?: boolean;
  }): Promise<{ signedPsbt: string; signedHexPsbt: string }>;

  /** Sign all inputs with segwit key (if available) */
  signAllSegwitInputs(params: {
    rawPsbt: string;
    finalize: boolean;
  }): Promise<{ signedPsbt: string; signedHexPsbt: string }>;

  /** Sign an arbitrary message */
  signMessage(params: {
    message: string;
    protocol: "ecdsa" | "bip322";
    keypair: ECPairInterface;
    address?: string;
  }): Promise<string>;
}
