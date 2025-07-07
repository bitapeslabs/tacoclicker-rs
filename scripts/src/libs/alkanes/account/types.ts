import * as bitcoin from "bitcoinjs-lib";

export enum AddressType {
  P2PKH,
  P2TR,
  P2SH_P2WPKH,
  P2WPKH,
}

export type IAccount = {
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
  spendStrategy: ISpendStrategy;
  network: bitcoin.Network;
};

export type IAddressKey =
  | "nativeSegwit"
  | "taproot"
  | "nestedSegwit"
  | "legacy";

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

export interface ISpendStrategy {
  addressOrder: IAddressKey[];
  utxoSortGreatestToLeast: boolean;
  changeAddress: IAddressKey;
}

export interface MnemonicToAccountOptions {
  network?: bitcoin.networks.Network;
  index?: number;
  spendStrategy?: ISpendStrategy;
  hdPaths?: HDPaths;
}
