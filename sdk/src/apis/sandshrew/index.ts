import {
  BoxedError,
  BoxedSuccess,
  BoxedResponse,
  consumeOrThrow,
  isBoxedError,
  consumeAll,
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
  AlkanesByAddressResponse,
  AlkanesOutpointExtended,
  AlkanesByAddressOutpoint,
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

  async sandshrew_multcall<T>(
    rpcCalls: RpcCall<T>[]
  ): Promise<BoxedResponse<T[], SandshrewFetchError>> {
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

      return new BoxedSuccess(
        rpcResponse.map((response) => response.result) as T[]
      );
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
      const currentBlockHeight = Number(
        consumeOrThrow(
          await this.alkanesRpcProvider.alkanes_metashrewHeight().call()
        )
      );

      const availableUtxos = consumeOrThrow(
        await this.electrumApiProvider.esplora_getutxos(address)
      );

      const spendableInputs = consumeOrThrow(
        await this.electrumApiProvider.esplora_getspendableinputs(
          availableUtxos
        )
      );

      const spendableInputMap = new Map<string, IEsploraSpendableUtxo>(
        spendableInputs.map((utxo) => [`${utxo.txid}:${utxo.vout}`, utxo])
      );

      const [ordOutputs, alkanesOutpointsResponse] = consumeAll(
        await Promise.all([
          this.sandshrew_multcall(
            availableUtxos.map((unspent) =>
              this.ordRpcProvider.ord_getTxOutput(
                `${unspent.txid}:${unspent.vout}`
              )
            )
          ),

          this.alkanesRpcProvider.alkanes_getAlkanesByAddress(address),
        ] as const)
      );

      const alkanesOutpointsByAddress = alkanesOutpointsResponse.outpoints;

      const alkaneOutpointMap = new Map<string, AlkanesByAddressOutpoint>(
        alkanesOutpointsByAddress.map((outpoint) => [
          `${outpoint.outpoint.txid}:${outpoint.outpoint.vout}`,
          outpoint,
        ])
      );

      const formattedList: FormattedUtxo[] = [];

      for (let index = 0; index < availableUtxos.length; index++) {
        const rawUtxo = availableUtxos[index];
        const ordOutput = ordOutputs[index];
        const alkaneAddressOutput = alkaneOutpointMap.get(
          `${rawUtxo.txid}:${rawUtxo.vout}`
        );

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

        let alkanesMap: Record<string, AlkanesUtxoEntry> | undefined;

        if (alkaneAddressOutput) {
          alkanesMap = alkaneAddressOutput.runes.reduce(
            (acc, alkaneOutpoint) => {
              const alkaneId = `${alkaneOutpoint.rune.id.block}:${alkaneOutpoint.rune.id.tx}`;

              if (!acc[alkaneId]) {
                acc[alkaneId] = {
                  name: alkaneOutpoint.rune.name,
                  symbol: alkaneOutpoint.rune.symbol,
                  value: "0",
                  id: alkaneId,
                };
              }

              acc[alkaneId].value = (
                BigInt(acc[alkaneId].value) + BigInt(alkaneOutpoint.balance)
              ).toString();

              return acc;
            },
            {} as Record<string, AlkanesUtxoEntry>
          );
        }

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
          alkanes: alkanesMap ?? {},
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
