import { BoxedResponse, BoxedSuccess, BoxedError, isBoxedError } from "@/boxed";
import { buildRpcCall } from "../sandshrew/shared";
import { decodeCBOR } from "./utils";

import {
  OrdPaginatedIds,
  OrdInscription,
  OrdOutput,
  OrdSat,
  OrdBlock,
} from "./types";
import { ALKANES_PROVIDER } from "@/consts";

export enum OrdFetchError {
  UnknownError = "UnknownError",
  RpcError = "RpcError",
}

export const ord_getInscriptions = (startingNumber?: string) =>
  buildRpcCall<OrdPaginatedIds>("ord_inscriptions", [startingNumber ?? ""]);

export const ord_getInscriptionsByBlockHash = (hash: string) =>
  buildRpcCall<OrdBlock>("ord_block", [hash]);

export const ord_getInscriptionsByBlockHeight = (
  height: string,
  page?: string
) =>
  buildRpcCall<OrdBlock>("ord_inscriptions:block", [
    height,
    ...(page ? [page] : []),
  ]);

export const ord_getInscriptionById = (id: string) =>
  buildRpcCall<OrdInscription>("ord_inscription", [id]);

export const ord_getInscriptionByNumber = (number: string) =>
  buildRpcCall<OrdInscription>("ord_inscription", [number]);

export const ord_getInscriptionContent = (id: string) =>
  buildRpcCall<string>("ord_content", [id]);

export const ord_getInscriptionPreview = (id: string) =>
  buildRpcCall<string>("ord_preview", [id]);

export const ord_getInscriptionChildren = (id: string, page?: string) =>
  buildRpcCall<OrdPaginatedIds>("ord_r:children", [
    id,
    ...(page ? [page] : []),
  ]);

export const ord_getTxOutput = (txidVout: string) =>
  buildRpcCall<OrdOutput>("ord_output", [txidVout]);

export const ord_getSatByNumber = (n: string) =>
  buildRpcCall<OrdSat>("ord_sat", [n]);

export const ord_getSatByDecimal = (decimal: string) =>
  buildRpcCall<OrdSat>("ord_sat", [decimal]);

export const ord_getSatByDegree = (degree: string) =>
  buildRpcCall<OrdSat>("ord_sat", [degree]);

export const ord_getSatByName = (name: string) =>
  buildRpcCall<OrdSat>("ord_sat", [name]);

export const ord_getSatByPercentile = (percentile: string) =>
  buildRpcCall<OrdSat>("ord_sat", [percentile]);

export const ord_getInscriptionIdsBySat = (satNumber: string, page?: string) =>
  buildRpcCall<OrdPaginatedIds>("ord_r:sat", [
    satNumber,
    ...(page ? [page] : []),
  ]);

export const ord_getInscriptionIdBySatAt = (
  satNumber: string,
  index?: string
) =>
  buildRpcCall<{ id: string }>("ord_r:sat::at", [
    satNumber,
    ...(index ? [index] : []),
  ]);

export const ord_getRuneByName = (name: string) =>
  buildRpcCall<unknown>("ord_rune", [name]); // no schema yet

export const ord_getRuneById = (id: string) =>
  buildRpcCall<unknown>("ord_rune", [id]);

export const ord_getRunes = () => buildRpcCall<unknown>("ord_runes");

export const ord_getAddressData = (address: string) =>
  buildRpcCall<unknown>("ord_address", [address]);

export const ord_getInscriptionMetadata = async (id: string) => {
  const hexResp = await buildRpcCall<string>("ord_r:metadata", [id]).call();
  if (isBoxedError(hexResp)) return hexResp;

  try {
    return new BoxedSuccess(decodeCBOR(hexResp.data));
  } catch (err) {
    return new BoxedError(
      OrdFetchError.UnknownError,
      (err as Error)?.message ?? "Failed to decode CBOR"
    );
  }
};
export * from "./types";
export * from "./utils";
