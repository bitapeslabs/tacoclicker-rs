import {
  BoxedResponse,
  BoxedSuccess,
  BoxedError,
  consumeOrThrow,
} from "@/boxed";
import { RpcCall, RpcTuple } from "./shared";
import { ALKANES_PROVIDER } from "@/consts";
import { FormattedUtxo } from "./types";
import { esplora_getspendableinputs, esplora_getutxos } from "../esplora";
import { EsploraUtxo, IEsploraSpendableUtxo } from "../esplora/types";
import { ord_getInscriptionById, ord_getTxOutput } from "../ord";
import {
  alkanes_getAlkanesByOutpoint,
  alkanes_metashrewHeight,
} from "../alkanes";
import { AlkanesUtxoEntry } from "../alkanes/types";
import { AlkaneReadableId, AlkanesOutpoint } from "../alkanes/types";
import { OrdOutput } from "../ord/types";

export enum SandshrewFetchError {
  UnknownError = "UnknownError",
  RpcError = "RpcError",
}

export async function sandshrew_multiget(
  calls: RpcCall<unknown>[]
): Promise<BoxedResponse<unknown[], SandshrewFetchError>> {
  const tuples: RpcTuple[] = calls.map((c) => c.payload);

  try {
    const res = await fetch(ALKANES_PROVIDER.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Date.now(),
        method: "sandshrew_multicall",
        params: [tuples],
      }),
    });

    const json = await res.json();
    if (json.error) {
      return new BoxedError(
        SandshrewFetchError.RpcError,
        typeof json.error === "string" ? json.error : json.error.message
      );
    }
    return new BoxedSuccess(json.result as unknown[]);
  } catch (err) {
    return new BoxedError(
      SandshrewFetchError.UnknownError,
      (err as Error)?.message ?? "Unknown Error"
    );
  }
}

//will abort if the user has more than 500 utxos because of electrs!
export async function sandshrew_getFormattedUtxosForAddress(
  address: string
): Promise<BoxedResponse<FormattedUtxo[], SandshrewFetchError>> {
  try {
    const currentBlockHeight = Number(
      consumeOrThrow(await alkanes_metashrewHeight().call())
    );

    const availableUtxos = consumeOrThrow(await esplora_getutxos(address));

    const availableSpendableUtxos = consumeOrThrow(
      await esplora_getspendableinputs(availableUtxos)
    );

    const utxoMap = new Map<string, IEsploraSpendableUtxo>(
      availableSpendableUtxos.map((utxo) => [`${utxo.txid}:${utxo.vout}`, utxo])
    );

    const [ordByOutpoints, alkanesByOutpoints] = (
      await Promise.all([
        sandshrew_multiget(
          availableUtxos.map((utxo) =>
            ord_getTxOutput(`${utxo.txid}:${utxo.vout}`)
          )
        ),
        sandshrew_multiget(
          availableUtxos.map((utxo) =>
            alkanes_getAlkanesByOutpoint(utxo.txid, utxo.vout)
          )
        ),
      ])
    ).map(consumeOrThrow) as [OrdOutput[], AlkanesOutpoint[]];

    let formattedUtxos: FormattedUtxo[] = [];
    for (let i = 0; i < availableUtxos.length; i++) {
      const utxo = availableUtxos[i];
      const ordOutput = ordByOutpoints[i];
      const esploraUtxo = utxoMap.get(`${utxo.txid}:${utxo.vout}`);
      const alkanesOutput = alkanesByOutpoints[i];
      const confirmations =
        currentBlockHeight - Number(esploraUtxo?.prevTx.status.block_height);

      const alkanes: Record<string, AlkanesUtxoEntry> =
        alkanesOutput.runes.reduce(
          (acc, rune) => {
            const readableId: AlkaneReadableId = `${rune.rune.id.block}:${rune.rune.id.tx}`;
            acc[readableId] = {
              value: rune.balance,
              name: rune.rune.name,
              symbol: rune.rune.symbol,
            };
            return acc;
          },
          {} as Record<string, AlkanesUtxoEntry>
        );

      const formattedUtxo: FormattedUtxo = {
        txId: utxo.txid,
        outputIndex: utxo.vout,
        satoshis: utxo.value,
        address: esploraUtxo?.prevTx.vout[utxo.vout].scriptpubkey_address!,
        scriptPk: esploraUtxo?.prevTx.vout[utxo.vout].scriptpubkey!,
        confirmations,
        indexed: confirmations > 0,
        inscriptions: ordOutput.inscriptions,
        runes: ordOutput.runes,
        alkanes: alkanes,
        prevTx: esploraUtxo?.prevTx!,
        prevTxHex: esploraUtxo?.prevTx.hex!,
      };

      formattedUtxos.push(formattedUtxo);
    }
    return new BoxedSuccess(formattedUtxos);
  } catch (err) {
    return new BoxedError(
      SandshrewFetchError.UnknownError,
      (err as Error).message
    );
  }
}
export * from "./types";
