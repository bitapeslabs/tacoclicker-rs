/* AlkanesProvider.ts ------------------------------------------------------ */
import {
  BoxedError,
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
  AlkanesTraceResult,
  AlkaneEncodedSimulationRequest,
} from "@/apis/alkanes/types";
import {
  parseSimulateReturn,
  decodeAlkanesTrace,
  extractAbiErrorMessage,
} from "./utils";
import { Provider } from "@/provider";
import { AlkanesSimulationError } from "@/libs";
import { excludeFields } from "@/utils";

export enum AlkanesFetchError {
  UnknownError = "UnknownError",
  RpcError = "RpcError",
}

export enum AlkanesTraceError {
  DecodeError = "DecodeError",
  NoTraceFound = "NoTraceFound",
  TransactionReverted = "TransactionReverted",
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
      call: async (): Promise<
        BoxedResponse<AlkanesTraceResult, AlkanesTraceError>
      > => {
        try {
          const encoded = consumeOrThrow(
            await this.rpc<AlkanesTraceEncodedResult>("alkanes_trace", [
              { txid: leTxid, vout },
            ]).call()
          );

          let decoded = decodeAlkanesTrace(encoded);

          if (decoded.length === 0) {
            return new BoxedError(
              AlkanesTraceError.NoTraceFound,
              "No trace found for the given txid and vout"
            );
          }

          let returnEvent = decoded.find(
            (traceEvent) => traceEvent.event === "return"
          );

          let encodedReturnEvent = encoded.find(
            (traceEvent) => traceEvent.event === "return"
          );

          if (!returnEvent || !encodedReturnEvent) {
            return new BoxedError(
              AlkanesTraceError.DecodeError,
              "No return event found in alkanes trace"
            );
          }

          let isError = returnEvent?.data.status !== "success"; //errors if the return event isnt found or status is revert

          if (isError) {
            let errorMessage;
            try {
              errorMessage = extractAbiErrorMessage(
                encodedReturnEvent.data.response.data
              );
            } catch (err) {
              console.log(returnEvent.data.response);
              console.log(err);
              errorMessage = "Unknown error decoding alkanes trace";
            }

            return new BoxedError(
              AlkanesTraceError.TransactionReverted,
              `Transaction reverted with message: ${errorMessage}`
            );
          }

          return new BoxedSuccess(decoded);
        } catch (err) {
          return new BoxedError(
            AlkanesTraceError.DecodeError,
            (err as Error).message ?? "Unknown error decoding alkanes trace"
          );
        }
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
    req: AlkaneSimulateRequest
  ): Promise<BoxedResponse<AlkanesSimulationResult, string>> {
    const currentHeight =
      (await this.alkanes_metashrewHeight().call()) as BoxedResponse<
        string,
        string
      >;
    if (isBoxedError(currentHeight)) return currentHeight;

    const merged: AlkaneEncodedSimulationRequest = {
      alkanes: req.alkanes ?? [],
      transaction: req.transaction ?? "0x",
      block: "0x",
      height: req.height ?? currentHeight.data,
      txindex: req.txindex ?? 0,
      target: {
        block: req.target?.block?.toString() ?? "0",
        tx: req.target?.tx?.toString() ?? "0",
      },
      inputs: req.callData?.map((input) => input.toString()) ?? [],
      pointer: req.pointer ?? 0,
      refundPointer: req.refundPointer ?? 0,
      vout: req.vout ?? 0,
    };

    const res = await this.rpc<AlkanesRawSimulationResponse>(
      "alkanes_simulate",
      [merged]
    ).call();

    if (isBoxedError(res)) return res;
    if (res.data.execution.error) {
      return new BoxedError(
        AlkanesSimulationError.UnknownError,
        res.data.execution.error
      );
    }

    return new BoxedSuccess({
      raw: res.data,
      parsed: parseSimulateReturn(res.data.execution.data),
    });
  }
}

export * from "./types";
export * from "./utils";
