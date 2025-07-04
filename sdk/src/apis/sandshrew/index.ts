import {
  BoxedError,
  BoxedSuccess,
  BoxedResponse,
  consumeOrThrow,
  isBoxedError,
} from "@/boxed";
import { Provider } from "@/provider";

import { RpcCall, RpcResponse, RpcTuple } from "./shared";

import { ElectrumApiProvider } from "../esplora";

import { OrdRpcProvider } from "../ord";

import { AlkanesRpcProvider } from "../alkanes";

import {
  EsploraUtxo,
  IEsploraSpendableUtxo,
  IEsploraTransaction,
} from "../esplora/types";

import { OrdOutput } from "../ord/types";

import {
  AlkanesOutpoint,
  AlkanesUtxoEntry,
  AlkaneReadableId,
  AlkanesOutpoints,
  AlkanesOutpointsExtended,
} from "../alkanes/types";

import { FormattedUtxo } from "./types";

export enum SandshrewFetchError {
  UnknownError = "UnknownError",
  InternalError = "InternalError",
}

export class SandshrewRpcProvider {
  constructor(
    private readonly provider: Provider,
    private readonly electrumApiProvider: ElectrumApiProvider,
    private readonly ordRpcProvider: OrdRpcProvider,
    private readonly alkanesRpcProvider: AlkanesRpcProvider
  ) {}

  async sandshrew_multcall(
    rpcCalls: RpcCall<unknown>[]
  ): Promise<BoxedResponse<unknown[], SandshrewFetchError>> {
    const rpcTuples: RpcTuple[] = rpcCalls.map((rpcCall) => rpcCall.payload);

    try {
      const rpcResponse = consumeOrThrow(
        await this.provider
          .buildRpcCall<
            RpcResponse<unknown>[]
          >("sandshrew_multicall", rpcTuples)
          .call()
      );

      const errors = rpcResponse.filter(
        (response) => response?.error !== undefined
      );

      if (errors.length > 0) {
        return new BoxedError(
          SandshrewFetchError.InternalError,
          `
          Some RPC calls failed:
          ${errors.map((error, index) => `(${index}) Method ${rpcCalls[index].call.name} with params ${rpcCalls[index].payload} failed with error: ${error}\n\n`)}
          `
        );
      }

      return new BoxedSuccess(rpcResponse.map((response) => response.result));
    } catch (error) {
      return new BoxedError(
        SandshrewFetchError.UnknownError,
        (error as Error).message ?? "Unknown Error"
      );
    }
  }

  /* -------------------------------------------------------------- */
  /* Build a fully formatted UTXO list for one address              */
  /* -------------------------------------------------------------- */
  async sandshrew_getFormattedUtxosForAddress(
    address: string
  ): Promise<BoxedResponse<FormattedUtxo[], SandshrewFetchError>> {
    try {
      /* 1.  Current chain height (for confirmation count) */
      const currentBlockHeight = Number(
        consumeOrThrow(
          await this.alkanesRpcProvider.alkanes_metashrewHeight().call()
        )
      );

      /* 2.  All confirmed UTXOs for this address */
      const availableUtxos = consumeOrThrow(
        await this.electrumApiProvider.esplora_getutxos(address)
      );

      /* 3.  Enrich each UTXO with its full previous transaction */
      const spendableInputs = consumeOrThrow(
        await this.electrumApiProvider.esplora_getspendableinputs(
          availableUtxos
        )
      );

      const spendableInputMap = new Map<string, IEsploraSpendableUtxo>(
        spendableInputs.map((utxo) => [`${utxo.txid}:${utxo.vout}`, utxo])
      );

      /* 4.  Fetch Ord output + Alkanes runes in two multicalls     */
      const [ordOutputs, alkanesOutpointsMatrix] = (
        await Promise.all([
          this.sandshrew_multcall(
            availableUtxos.map((unspent) =>
              this.ordRpcProvider.ord_getTxOutput(
                `${unspent.txid}:${unspent.vout}`
              )
            )
          ),
          this.sandshrew_multcall(
            availableUtxos.map((unspent) =>
              this.alkanesRpcProvider.alkanes_getAlkanesByOutpoint(
                unspent.txid,
                unspent.vout
              )
            )
          ),
        ])
      ).map(consumeOrThrow) as [OrdOutput[], AlkanesOutpoints[]];

      let alkanesOutpointsMatrixExtended: AlkanesOutpointsExtended[] =
        alkanesOutpointsMatrix.map((alkaneBalance, index) => {
          const utxo = availableUtxos[index];
          const outpointId = `${utxo.txid}:${utxo.vout}`;

          return alkaneBalance.map((alkane) => ({
            ...alkane,
            outpoint: outpointId,
          }));
        });

      /* 5.  Assemble nicely-typed FormattedUtxo objects            */
      const formattedList: FormattedUtxo[] = [];

      for (let index = 0; index < availableUtxos.length; index++) {
        const rawUtxo = availableUtxos[index];
        const ordOutput = ordOutputs[index];
        const alkanesOutpoints = alkanesOutpointsMatrixExtended[index];

        const spendableInput = spendableInputMap.get(
          `${rawUtxo.txid}:${rawUtxo.vout}`
        );

        if (!spendableInput) {
          return new BoxedError(
            SandshrewFetchError.UnknownError,
            `Spendable input not found for ${rawUtxo.txid}:${rawUtxo.vout}`
          );
        }

        const confirmations =
          currentBlockHeight -
          Number(spendableInput.prevTx.status.block_height);

        const alkanesMap: Record<string, AlkanesUtxoEntry> =
          alkanesOutpoints.reduce(
            (acc, alkaneOutpoint) => {
              const alkaneId = `${alkaneOutpoint.token.id.block}:${alkaneOutpoint.token.id.tx}`;

              if (!acc[alkaneId]) {
                acc[alkaneId] = {
                  name: alkaneOutpoint.token.name,
                  symbol: alkaneOutpoint.token.symbol,
                  value: "0",
                };
              }

              acc[alkaneId].value = (
                BigInt(acc[alkaneId].value) + BigInt(alkaneOutpoint.value)
              ).toString();

              return acc;
            },
            {} as Record<string, AlkanesUtxoEntry>
          );

        const formattedUtxo: FormattedUtxo = {
          txId: rawUtxo.txid,
          outputIndex: rawUtxo.vout,
          satoshis: rawUtxo.value,
          address:
            spendableInput.prevTx.vout[rawUtxo.vout].scriptpubkey_address,
          scriptPk: spendableInput.prevTx.vout[rawUtxo.vout].scriptpubkey,
          confirmations,
          indexed: confirmations > 0,
          inscriptions: ordOutput.inscriptions,
          runes: ordOutput.runes,
          alkanes: alkanesMap,
          prevTx: spendableInput.prevTx,
          prevTxHex: spendableInput.prevTx.hex,
        };

        formattedList.push(formattedUtxo);
      }

      return new BoxedSuccess(formattedList);
    } catch (error) {
      console.error(error);
      return new BoxedError(
        SandshrewFetchError.UnknownError,
        (error as Error).message
      );
    }
  }
}

/* Re-export legacy types / helpers so old import paths keep working */
export * from "./types";
export * from "./shared";
