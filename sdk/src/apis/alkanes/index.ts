import { BoxedResponse, BoxedSuccess, BoxedError, isBoxedError } from "@/boxed";
import {
  AlkanesResponse,
  AlkanesByAddressResponse,
  AlkanesOutpoint,
  AlkaneId,
  AlkaneToken,
  AlkaneSimulateRequest,
  AlkanesRawSimulationResponse,
  AlkanesSimulationResult,
} from "@/apis/alkanes/types";
import { parseSimulateReturn } from "./utils";
import { buildRpcCall } from "../sandshrew/shared";

export enum AlkanesFetchError {
  UnknownError = "UnknownError",
  RpcError = "RpcError",
}

export const alkanes_metashrewHeight = () => buildRpcCall("metashrew_height");

export const alkanes_getAlkanesByAddress = async (
  address: string,
  protocolTag = "1",
  runeName?: string
) => {
  const res = await buildRpcCall<AlkanesByAddressResponse>(
    "alkanes_protorunesbyaddress",
    [{ address, protocolTag }]
  ).call();

  if (isBoxedError(res)) return res;

  const outpoints = res.data.outpoints
    .filter((o) => o.runes.length)
    .map((o) => ({
      ...o,
      outpoint: {
        vout: o.outpoint.vout,
        txid: Buffer.from(o.outpoint.txid, "hex").reverse().toString("hex"),
      },
      runes: o.runes.map((r) => ({
        ...r,
        balance: parseInt(r.balance, 16).toString(),
        rune: {
          ...r.rune,
          id: {
            block: parseInt(r.rune.id.block, 16).toString(),
            tx: parseInt(r.rune.id.tx, 16).toString(),
          },
        },
      })),
    }));

  const filtered = runeName
    ? outpoints.flatMap((op) =>
        op.runes.filter((r) => r.rune.name === runeName)
      )
    : outpoints;

  return new BoxedSuccess(filtered as AlkanesOutpoint[]);
};

export const alkanes_getAlkanesByHeight = (height: number, protocolTag = "1") =>
  buildRpcCall<AlkanesResponse>("alkanes_protorunesbyheight", [
    { height, protocolTag },
  ]);

export const alkanes_getAlkanesByOutpoint = (
  txid: string,
  vout: number,
  protocolTag = "1",
  height = "latest"
) => {
  const littleEndianTxid = Buffer.from(txid, "hex").reverse().toString("hex");
  return buildRpcCall<AlkanesOutpoint[]>("alkanes_protorunesbyoutpoint", [
    { txid: littleEndianTxid, vout, protocolTag },
    height,
  ]);
};

export const alkanes_trace = (txid: string, vout: number) => {
  const littleEndianTxid = Buffer.from(txid, "hex").reverse().toString("hex");
  return buildRpcCall<unknown>("alkanes_trace", [
    { txid: littleEndianTxid, vout },
  ]);
};

export const alkanes_getAlkaneById = (id: AlkaneId) =>
  buildRpcCall("alkanes_meta", [
    {
      target: id,
      alkanes: [],
      transaction: "0x",
      block: "0x",
      height: "0x",
      txindex: 0,
      inputs: [],
      pointer: 0,
      refundPointer: 0,
      vout: 0,
    },
  ]);

export const alkanes_simulate = async (
  req: Partial<AlkaneSimulateRequest>
): Promise<BoxedResponse<AlkanesSimulationResult, string>> => {
  const curentHeight =
    (await alkanes_metashrewHeight().call()) as BoxedResponse<string, string>;
  if (isBoxedError(curentHeight)) return curentHeight;

  const merged: AlkaneSimulateRequest = {
    alkanes: [],
    transaction: "0x",
    block: "0x",
    height: curentHeight.data,
    txindex: 0,
    target: { block: "0", tx: "0" },
    inputs: [],
    pointer: 0,
    refundPointer: 0,
    vout: 0,
    ...req,
  };
  const res = await buildRpcCall<AlkanesRawSimulationResponse>(
    "alkanes_simulate",
    [merged]
  ).call();

  if (isBoxedError(res)) return res;
  return new BoxedSuccess({
    raw: res.data,
    parsed: parseSimulateReturn(res.data.execution.data),
  });
};

export * from "./types";
