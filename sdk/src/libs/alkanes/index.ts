import * as bitcoin from "bitcoinjs-lib";
import { addInputDynamic, getEstimatedFee } from "./utils";

import {
  sandshrew_getFormattedUtxosForAddress,
  FormattedUtxo,
} from "@/apis/sandshrew";

import {
  BoxedResponse,
  BoxedSuccess,
  BoxedError,
  consumeOrThrow,
} from "@/boxed";
import { DEFAULT_FEE_RATE } from "@/consts";
import { alkanes_simulate, AlkaneSimulateRequest } from "@/apis/alkanes";

export enum AlkanesExecuteError {
  UnknownError = "UnknownError",
}

export interface AlkanesExecuteResponse {
  psbt: string;
  fee: number;
  vsize: number;
}

export const simulate = (params: Partial<AlkaneSimulateRequest>) =>
  alkanes_simulate(params);

export const execute = async ({
  address,
  protostone,
  feeRate = DEFAULT_FEE_RATE,
}: {
  address: string;
  protostone: Buffer;
  feeRate?: number;
}): Promise<BoxedResponse<AlkanesExecuteResponse, AlkanesExecuteError>> => {
  try {
    const availableUtxos = consumeOrThrow(
      await sandshrew_getFormattedUtxosForAddress(address)
    );

    const alkanesUtxos = availableUtxos.filter(
      (u) => Object.values(u.alkanes ?? {}).length > 0
    );

    const { psbt, fee, vsize } = await buildExecutePsbt({
      address,
      protostone,
      alkanesUtxos,
      utxos: availableUtxos,
      feeRate,
    });

    return new BoxedSuccess({ psbt, fee, vsize });
  } catch (err) {
    return new BoxedError(
      AlkanesExecuteError.UnknownError,
      (err as Error)?.message ?? "Unknown Error"
    );
  }
};

async function buildExecutePsbt({
  address,
  protostone,
  alkanesUtxos, // <-- keep!
  utxos,
  feeRate,
}: {
  address: string;
  protostone: Buffer;
  alkanesUtxos: FormattedUtxo[];
  utxos: FormattedUtxo[];
  feeRate: number;
}): Promise<{ psbt: string; fee: number; vsize: number }> {
  const network = bitcoin.networks.bitcoin; // hard-code mainnet; change if needed
  const SAT_PER_VBYTE = feeRate;
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
export * from "./provider";
