import { OrdOutputRune, RuneName } from "../ord/types";
import { AlkaneReadableId, AlkanesUtxoEntry } from "../alkanes/types";
import { IEsploraTransaction } from "../esplora/types";
export type FormattedUtxo = {
  txId: string;
  outputIndex: number;
  satoshis: number;
  scriptPk: string;
  address: string;
  inscriptions: string[];
  runes: Record<RuneName, OrdOutputRune>;
  alkanes: Record<AlkaneReadableId, AlkanesUtxoEntry>;
  confirmations: number;
  indexed: boolean;
  prevTx: IEsploraTransaction;
  prevTxHex: string;
};
