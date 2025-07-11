import * as bitcoin from "bitcoinjs-lib";
import { addInputDynamic, getEstimatedFee, minimumFee } from "./utils";

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
import { getProtostoneUnsignedPsbtBase64, SingularTransfer } from "./psbt";

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
}: {
  provider: Provider;
  address: string;
  callData: bigint[];
  feeRate?: number;
  transfers?: SingularTransfer[];
}): Promise<BoxedResponse<AlkanesExecuteResponse, AlkanesExecuteError>> => {
  try {
    const {
      psbtBase64: psbt,
      fee,
      vsize,
    } = consumeOrThrow(
      await getProtostoneUnsignedPsbtBase64(address, {
        provider,
        transfers: transfers ?? [],
        callData,
        feeRate,
      })
    );

    return new BoxedSuccess({ psbt, fee, vsize });
  } catch (err) {
    console.error("Alkanes execute error:", err);
    return new BoxedError(
      AlkanesExecuteError.UnknownError,
      (err as Error)?.message ?? "Unknown Error"
    );
  }
};

export * from "./types";
export * from "./utils";
export * from "./psbt";
