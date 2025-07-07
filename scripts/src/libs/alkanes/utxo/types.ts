import { IAddressKey } from "../account/types";
import { OrdOutputRune } from "../rpclient/ord";

export interface GatheredUtxos {
  utxos: FormattedUtxo[];
  totalAmount: number;
}

export type AlkaneReadableId = string;

export interface FormattedUtxo {
  txId: string;
  outputIndex: number;
  satoshis: number;
  scriptPk: string;
  address: string;
  inscriptions: string[];
  runes: Record<string, OrdOutputRune>;
  alkanes: Record<AlkaneReadableId, AlkanesUtxoEntry>;
  confirmations: number;
  indexed: boolean;
}

export interface AddressUtxoPortfolio {
  utxos: FormattedUtxo[];
  alkaneUtxos: FormattedUtxo[];
  spendableTotalBalance: number;
  spendableUtxos: FormattedUtxo[];
  runeUtxos: FormattedUtxo[];
  ordUtxos: FormattedUtxo[];
  pendingUtxos: FormattedUtxo[];
  pendingTotalBalance: number;
  totalBalance: number;
}

export interface AccountUtxoPortfolio {
  accountUtxos: FormattedUtxo[];
  accountTotalBalance: number;
  accountSpendableTotalUtxos: FormattedUtxo[];
  accountSpendableTotalBalance: number;
  accountPendingTotalBalance: number;
  accounts: Record<IAddressKey, AddressUtxoPortfolio>;
}

export type AlkanesUtxoEntry = {
  value: string;
  name: string;
  symbol: string;
};
