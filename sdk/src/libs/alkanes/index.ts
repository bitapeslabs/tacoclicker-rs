import * as bitcoin from "bitcoinjs-lib";
import { addInputDynamic, getEstimatedFee, minimumFee } from "./utils";

import { FormattedUtxo } from "@/apis/sandshrew";
import { encodeRunestoneProtostone, encipher, ProtoStone } from "alkanes";
import { BoxedResponse, BoxedSuccess, BoxedError, consumeOrThrow } from "@/boxed";
import { AlkaneSimulateRequest } from "@/apis/alkanes";
import { Provider } from "@/provider";
import {
  AlkanesInscription,
  getProtostoneTransactionsWithInscription,
  getProtostoneUnsignedPsbtBase64,
  SingularTransfer,
} from "./psbt";

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
  transfers,
  inscription,
  signPsbt,
}: {
  provider: Provider;
  address: string;
  callData: bigint[];
  signPsbt: (unsignedPsbtBase64: string) => Promise<string>;
  feeRate?: number;
  transfers?: SingularTransfer[];
  inscription?: AlkanesInscription<unknown>;
}): Promise<BoxedResponse<string[], AlkanesExecuteError>> => {
  try {
    if (!inscription) {
      const { psbtBase64: psbt } = consumeOrThrow(
        await getProtostoneUnsignedPsbtBase64(address, {
          provider,
          transfers: transfers ?? [],
          callData,
          feeRate,
        }),
      );

      return new BoxedSuccess([await signPsbt(psbt)]);
    }

    const inscriptionTransactions = consumeOrThrow(
      await getProtostoneTransactionsWithInscription(address, inscription, signPsbt, {
        provider,
        transfers: transfers ?? [],
        callData,
        feeRate,
      }),
    );

    return new BoxedSuccess(inscriptionTransactions);
  } catch (err) {
    console.error("Alkanes execute error:", err);
    return new BoxedError(AlkanesExecuteError.UnknownError, (err as Error)?.message ?? "Unknown Error");
  }
};

export * from "./types";
export * from "./utils";
export * from "./psbt";
