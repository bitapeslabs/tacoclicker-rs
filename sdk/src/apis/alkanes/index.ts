/* AlkanesProvider.ts ------------------------------------------------------ */
import {
  BoxedResponse,
  BoxedSuccess,
  consumeOrThrow,
  isBoxedError,
} from "@/boxed";
import {
  AlkanesByAddressResponse,
  AlkanesOutpoint,
  AlkaneId,
  AlkaneSimulateRequest,
  AlkanesRawSimulationResponse,
  AlkanesSimulationResult,
  AlkanesOutpoints,
  AlkanesTraceEncodedResult,
} from "@/apis/alkanes/types";
import { parseSimulateReturn, decodeAlkanesTrace } from "./utils";
import { Provider } from "@/provider";

export enum AlkanesFetchError {
  UnknownError = "UnknownError",
  RpcError = "RpcError",
}

export class AlkanesRpcProvider {
  constructor(private readonly provider: Provider) {}

  private get rpc() {
    return this.provider.buildRpcCall.bind(this.provider);
  }

  alkanes_metashrewHeight() {
    return this.rpc<string>("metashrew_height", []);
  }

  async alkanes_getAlkanesByAddress(
    address: string,
    protocolTag = "1",
    runeName?: string
  ): Promise<BoxedResponse<AlkanesByAddressResponse, string>> {
    const res = await this.rpc<AlkanesByAddressResponse>(
      "alkanes_protorunesbyaddress",
      [{ address, protocolTag }]
    ).call();

    if (isBoxedError(res)) return res;

    return new BoxedSuccess(res.data);
  }

  alkanes_getAlkanesByHeight(height: number, protocolTag = "1") {
    throw "Method not implemented";
  }

  alkanes_getAlkanesByOutpoint(
    txid: string,
    vout: number,
    protocolTag = "1",
    height = "latest"
  ) {
    const leTxid = Buffer.from(txid, "hex").reverse().toString("hex");
    return this.rpc<AlkanesOutpoints[]>("alkanes_protorunesbyoutpoint", [
      { txid: leTxid, vout, protocolTag },
      height,
    ]);
  }

  alkanes_trace(txid: string, vout: number) {
    const leTxid = Buffer.from(txid, "hex").reverse().toString("hex");
    return {
      payload: ["alkanes_trace", [{ txid: leTxid, vout }]],
      call: async () => {
        return decodeAlkanesTrace(
          consumeOrThrow(
            await this.rpc<AlkanesTraceEncodedResult>("alkanes_trace", [
              { txid: leTxid, vout },
            ]).call()
          )
        );
      },
    };
  }

  alkanes_getAlkaneById(id: AlkaneId) {
    return this.rpc("alkanes_meta", [
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
  }

  async alkanes_simulate(
    req: Partial<AlkaneSimulateRequest>
  ): Promise<BoxedResponse<AlkanesSimulationResult, string>> {
    const currentHeight =
      (await this.alkanes_metashrewHeight().call()) as BoxedResponse<
        string,
        string
      >;
    if (isBoxedError(currentHeight)) return currentHeight;

    const merged: AlkaneSimulateRequest = {
      alkanes: [],
      transaction: "0x",
      block: "0x",
      height: currentHeight.data,
      txindex: 0,
      target: { block: "0", tx: "0" },
      inputs: [],
      pointer: 0,
      refundPointer: 0,
      vout: 0,
      ...req,
    };

    const res = await this.rpc<AlkanesRawSimulationResponse>(
      "alkanes_simulate",
      [merged]
    ).call();

    if (isBoxedError(res)) return res;

    return new BoxedSuccess({
      raw: res.data,
      parsed: parseSimulateReturn(res.data.result.execution.data),
      error: res.data.result.execution.error,
    });
  }
}

export * from "./types";
export * from "./utils";
