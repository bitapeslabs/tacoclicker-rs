import * as bitcoin from "bitcoinjs-lib";
import { addInputDynamic, getEstimatedFee } from "./utils";

import { FormattedUtxo } from "@/apis/sandshrew";
import { encodeRunestoneProtostone, encipher, ProtoStone } from "alkanes";
import {
  BoxedResponse,
  BoxedSuccess,
  BoxedError,
  consumeOrThrow,
} from "@/boxed";
import { AlkaneSimulateRequest } from "@/apis/alkanes";
import { Provider } from "@/provider";

export enum AlkanesExecuteError {
  UnknownError = "UnknownError",
  InvalidParams = "InvalidParams",
}

export interface AlkanesExecuteResponse {
  psbt: string;
  fee: number;
  vsize: number;
}

export const simulate = (provider: Provider, params: AlkaneSimulateRequest) => {
  return provider.rpc.alkanes.alkanes_simulate(params);
};

export const execute = async ({
  provider,
  address,
  callData,
  feeRate,
}: {
  provider: Provider;
  address: string;
  callData: bigint[];
  feeRate?: number;
}): Promise<BoxedResponse<AlkanesExecuteResponse, AlkanesExecuteError>> => {
  try {
    const sandshrew_getFormattedUtxosForAddress =
      provider.rpc.sandshrew.sandshrew_getFormattedUtxosForAddress.bind(
        provider.rpc.sandshrew
      );

    const protostoneBuffer = encodeRunestoneProtostone({
      protostones: [
        ProtoStone.message({
          protocolTag: 1n,
          edicts: [],
          pointer: 0,
          refundPointer: 0,
          calldata: encipher(callData),
        }),
      ],
    }).encodedRunestone;

    const availableUtxos = consumeOrThrow(
      await sandshrew_getFormattedUtxosForAddress(address)
    );

    const alkanesUtxos = availableUtxos.filter(
      (u) => Object.values(u.alkanes ?? {}).length > 0
    );

    const { psbt, fee, vsize } = await buildExecutePsbt({
      provider,
      address,
      protostone: protostoneBuffer,
      alkanesUtxos,
      utxos: availableUtxos,
      feeRate: feeRate ?? provider.defaultFeeRate, // default to 1 sat/vbyte if not provided
    });

    return new BoxedSuccess({ psbt, fee, vsize });
  } catch (err) {
    console.error("Alkanes execute error:", err);
    return new BoxedError(
      AlkanesExecuteError.UnknownError,
      (err as Error)?.message ?? "Unknown Error"
    );
  }
};

async function buildExecutePsbt({
  provider,
  address,
  protostone,
  alkanesUtxos, // <-- keep!
  utxos,
  feeRate,
}: {
  provider: Provider;
  address: string;
  protostone: Buffer;
  alkanesUtxos: FormattedUtxo[];
  utxos: FormattedUtxo[];
  feeRate?: number;
}): Promise<{ psbt: string; fee: number; vsize: number }> {
  const network = provider.network;
  const SAT_PER_VBYTE = feeRate ?? provider.defaultFeeRate;
  const MIN_RELAY = 546n;

  const psbt = new bitcoin.Psbt({ network });

  const addedUtxos = new Set<string>();

  for (const utxo of alkanesUtxos) {
    const key = `${utxo.txId}:${utxo.outputIndex}`;

    await addInputDynamic(psbt, network, utxo);
    addedUtxos.add(key);
  }

  for (const utxo of utxos) {
    const key = `${utxo.txId}:${utxo.outputIndex}`;
    if (addedUtxos.has(key)) continue; // skip already added UTXOs (probs an alkane utxo)
    await addInputDynamic(psbt, network, utxo);
    addedUtxos.add(key);
  }

  psbt.addOutput({ address, value: 546 }); // dummy receiver
  psbt.addOutput({ script: protostone, value: 0 });

  const { fee: estFee, vsize } = await getEstimatedFee({
    provider,
    psbtBase64: psbt.toBase64(),
    feeRate: SAT_PER_VBYTE,
  });

  const totalIn = utxos.reduce((acc, utxo) => acc + utxo.satoshis, 0);
  const totalOut = psbt.txOutputs.reduce(
    (acc, output) => acc + output.value,
    0
  );
  let change = totalIn - totalOut - estFee;

  if (change < 0) throw new Error("Insufficient balance");

  if (change >= Number(MIN_RELAY)) {
    psbt.addOutput({ address, value: change });
  } else {
    change = 0;
  }
  const final = await getEstimatedFee({
    provider,
    psbtBase64: psbt.toBase64(),
    feeRate: SAT_PER_VBYTE,
  });

  return {
    psbt: psbt.toBase64(),
    fee: final.fee,
    vsize: final.vsize,
  };
}

export * from "./types";
export * from "./utils";
