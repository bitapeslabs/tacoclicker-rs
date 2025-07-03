import * as bitcoin from "bitcoinjs-lib";

export enum AddressType {
  P2PKH,
  P2TR,
  P2SH_P2WPKH,
  P2WPKH,
}
export type Account = {
  taproot: {
    pubkey: string;
    pubKeyXOnly: string;
    address: string;
    hdPath: string;
  };
  nativeSegwit: {
    pubkey: string;
    address: string;
    hdPath: string;
  };
  nestedSegwit: {
    pubkey: string;
    address: string;
    hdPath: string;
  };
  legacy: {
    pubkey: string;
    address: string;
    hdPath: string;
  };
  spendStrategy: SpendStrategy;
  network: bitcoin.Network;
};

export type AddressKey = "nativeSegwit" | "taproot" | "nestedSegwit" | "legacy";

export type WalletStandard =
  | "bip44_account_last"
  | "bip44_standard"
  | "bip32_simple";

export type HDPaths = {
  legacy?: string;
  nestedSegwit?: string;
  nativeSegwit?: string;
  taproot?: string;
};

export interface SpendStrategy {
  addressOrder: AddressKey[];
  utxoSortGreatestToLeast: boolean;
  changeAddress: AddressKey;
}
