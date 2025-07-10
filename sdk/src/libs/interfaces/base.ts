import {
  BoxedResponse,
  isBoxedError,
  BoxedSuccess,
  BoxedError,
  consumeOrThrow,
} from "@/boxed";
import {
  AlkaneId,
  AlkanesTraceCreateEvent,
  AlkanesTraceInvokeEvent,
  AlkanesTraceResult,
  AlkanesTraceReturnEvent,
} from "@/apis";
import { Provider } from "@/provider";
import { Psbt } from "bitcoinjs-lib";
import { AlkanesTraceError } from "@/apis";
import { hexToUint8Array, sleep } from "@/utils";
import { AlkanesExecuteError } from "../alkanes";
import {
  IDecodableAlkanesResponse,
  DecodableAlkanesResponse,
} from "../decoders";
import { Expand } from "@/utils";

export enum AlkanesSimulationError {
  UnknownError = "UnknownError",
  TransactionReverted = "Revert",
}
export type OpcodeTable = { readonly [K in string]: bigint };

export type AlkanesPushExecuteResponse = Expand<{
  waitForResult: () => Promise<
    BoxedResponse<IDecodableAlkanesResponse, AlkanesExecuteError>
  >;
  txid: string;
}>;

export abstract class AlkanesBaseContract {
  constructor(
    protected readonly provider: Provider,
    protected readonly alkaneId: AlkaneId,
    private readonly signPsbtFn: (unsigned: string) => Promise<string>
  ) {}
  public abstract get OpCodes(): OpcodeTable;

  /*─────────────── thin helpers around Provider ───────────────*/
  protected get rpc() {
    return this.provider.buildRpcCall.bind(this.provider);
  }
  protected get execute() {
    return this.provider.execute.bind(this.provider);
  }

  protected get trace() {
    return this.provider.trace.bind(this.provider);
  }

  protected signPsbt(unsigned: string) {
    return this.signPsbtFn(unsigned);
  }

  simulate(
    request: Omit<Parameters<Provider["simulate"]>[0], "target">
  ): ReturnType<Provider["simulate"]> {
    return this.provider.simulate({ target: this.alkaneId, ...request });
  }
  pushExecute = async (
    config: Parameters<Provider["execute"]>[0]
  ): Promise<
    BoxedResponse<AlkanesPushExecuteResponse, AlkanesExecuteError>
  > => {
    try {
      const unsignedPsbt = consumeOrThrow(
        await this.provider.execute({
          ...config,
          callData: [this.alkaneId.block, this.alkaneId.tx, ...config.callData],
        })
      );

      const signedTx = await this.signPsbt(unsignedPsbt.psbt);

      const txid = consumeOrThrow(
        await this.provider.rpc.electrum.esplora_broadcastTx(signedTx)
      );

      return new BoxedSuccess({
        waitForResult: async (): Promise<
          BoxedResponse<IDecodableAlkanesResponse, AlkanesExecuteError>
        > => {
          try {
            const traceResult = consumeOrThrow(
              await this.provider.waitForTraceResult(txid)
            );
            return new BoxedSuccess(
              new DecodableAlkanesResponse(
                hexToUint8Array(traceResult.return.response.data)
              )
            );
          } catch (err) {
            return new BoxedError(
              AlkanesExecuteError.UnknownError,
              "Wait for result failed: " + (err as Error).message
            );
          }
        },
        txid,
      });
    } catch (err) {
      return new BoxedError(
        AlkanesExecuteError.UnknownError,
        "Push execute failed: " + (err as Error).message
      );
    }
  };
}
