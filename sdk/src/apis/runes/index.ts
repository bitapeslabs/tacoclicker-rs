import { buildRpcCall } from "../sandshrew/shared";

import { RunesAddressResult, RunesOutpointResult } from "./types";

export enum RunesFetchError {
  UnknownError = "UnknownError",
  RpcError = "RpcError",
}

export const runes_getAddress = (address: string, height: string = "latest") =>
  buildRpcCall<RunesAddressResult>("runes_address", [address, height]);

export const runes_getOutpoint = (
  txidVout: string,
  height: string = "latest"
) => buildRpcCall<RunesOutpointResult>("runes_outpoint", [txidVout, height]);
export * from "./types";
