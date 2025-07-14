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
import { BorshSchema } from "borsher";
import { abi, Schema, ResolveSchema } from "./builder"; // 🠕

export enum AlkanesSimulationError {
  UnknownError = "UnknownError",
  TransactionReverted = "Revert",
}
export type OpcodeTable = { readonly [K in string]: bigint };

export type AlkanesPushExecuteResponse<T> = Expand<{
  waitForResult: () => Promise<
    BoxedResponse<IDecodableAlkanesResponse<T>, AlkanesExecuteError>
  >;
  txid: string;
}>;

export abstract class AlkanesBaseContract {
  constructor(
    protected readonly provider: Provider,
    public readonly alkaneId: AlkaneId,
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
  pushExecute = async <T>(
    config: Parameters<Provider["execute"]>[0],
    borshSchema?: BorshSchema<T>
  ): Promise<
    BoxedResponse<AlkanesPushExecuteResponse<T>, AlkanesExecuteError>
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
          BoxedResponse<IDecodableAlkanesResponse<T>, AlkanesExecuteError>
        > => {
          try {
            const traceResult = consumeOrThrow(
              await this.provider.waitForTraceResult(txid)
            );
            return new BoxedSuccess(
              new DecodableAlkanesResponse(traceResult.return, borshSchema)
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

  protected async handleView<I extends Schema, O extends Schema>(
    opcode: bigint,
    arg: ResolveSchema<I>,
    outShape: O // may or may not be a BorshSchema
  ): Promise<BoxedResponse<ResolveSchema<O>, AlkanesSimulationError>> {
    console.log("params passed in:");
    console.log(opcode, arg, outShape);

    const callData = [opcode];
    const raw = consumeOrThrow(await this.simulate({ callData }));

    const maybeSchema =
      outShape instanceof BorshSchema
        ? (outShape as BorshSchema<ResolveSchema<O>>)
        : undefined;

    //return new BoxedSuccess(
    //new DecodableAlkanesResponse(raw, maybeSchema).toObject()
    //);

    return "" as any; // TODO: implement this
  }

  /*──────────────────────────────────────────────────────────*
   | Execute helper                                           |
   *──────────────────────────────────────────────────────────*/
  protected handleExecute<I extends Schema, O extends Schema>(
    address: string,
    opcode: bigint,
    arg: ResolveSchema<I>,
    outShape: O,
    asInscription: boolean
  ): Promise<
    BoxedResponse<
      AlkanesPushExecuteResponse<ResolveSchema<O>>,
      AlkanesExecuteError
    >
  > {
    console.log("params passed in:");
    console.log(address, opcode, arg, outShape, asInscription);
    const config = {
      address,
      callData: [opcode], // TODO encode `arg`
    };

    const maybeSchema = outShape instanceof BorshSchema ? outShape : undefined;

    //return this.pushExecute(config, maybeSchema);
    return "" as any;
  }
}
