import {
  BoxedResponse,
  isBoxedError,
  BoxedSuccess,
  BoxedError,
  consumeOrThrow,
} from "@/boxed";
import { AlkaneId } from "@/apis";
import { Provider } from "@/provider";

import {
  AlkanesExecuteError,
  AlkanesInscription,
  ProtostoneTransactionOptions,
} from "../alkanes";
import {
  IDecodableAlkanesResponse,
  DecodableAlkanesResponse,
  DecoderFns,
  DecodeError,
} from "../decoders";
import { Expand, sleep } from "@/utils";
import { BorshSchema, Infer as BorshInfer, borshSerialize } from "borsher";
import { abi, Schema, ResolveSchema, Dec } from "./builder"; // 🠕
import { Encodable, EncodeError, EncoderFns } from "../encoders";

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

const isBorshSchema = <T>(schema: Schema | Dec): schema is BorshSchema<T> =>
  !(typeof schema === "string");

export abstract class AlkanesBaseContract {
  constructor(
    protected readonly provider: Provider,
    public readonly alkaneId: AlkaneId,
    private readonly signPsbtFn: (unsigned: string) => Promise<string>,
  ) {}
  protected abstract get OpCodes(): OpcodeTable;

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

  public get signPsbt() {
    return this.signPsbtFn.bind(this);
  }

  public simulate(
    request: Omit<Parameters<Provider["simulate"]>[0], "target">,
  ): ReturnType<Provider["simulate"]> {
    return this.provider.simulate({ target: this.alkaneId, ...request });
  }

  private getEncodedCallData<I extends Schema>(
    arg: ResolveSchema<I>,
    shape: I,
  ): BoxedResponse<bigint[], EncodeError> {
    if (shape === "__void") {
      return new BoxedSuccess([]);
    }
    let encoder = isBorshSchema(shape)
      ? new Encodable(arg, shape)
      : new Encodable(arg);

    let bigintArrayResponse = isBorshSchema(shape)
      ? encoder.encodeFrom("object")
      : encoder.encodeFrom(shape as keyof EncoderFns<unknown>);

    return bigintArrayResponse;
  }

  private getDecodedResponse<O extends Schema>(
    response: ConstructorParameters<typeof DecodableAlkanesResponse>[0],
    outShape: O,
  ): BoxedResponse<ResolveSchema<O>, DecodeError> {
    try {
      let decodable = isBorshSchema(outShape)
        ? new DecodableAlkanesResponse(response, outShape)
        : new DecodableAlkanesResponse(response);
      let decodedResponse = isBorshSchema(outShape)
        ? decodable.decodeTo("object")
        : decodable.decodeTo(outShape as keyof DecoderFns<unknown>);
      return new BoxedSuccess(decodedResponse as ResolveSchema<O>);
    } catch (error) {
      return new BoxedError(
        DecodeError.UnknownError,
        "Decoding response failed: " + (error as Error).message,
      );
    }
  }

  public pushExecute = async <T>(
    config: Parameters<Provider["execute"]>[0],
    borshSchema?: BorshSchema<T>,
  ): Promise<
    BoxedResponse<AlkanesPushExecuteResponse<T>, AlkanesExecuteError>
  > => {
    try {
      const signedTxs = consumeOrThrow(
        await this.provider.execute({
          ...config,
          callData: [this.alkaneId.block, this.alkaneId.tx, ...config.callData],
        }),
      );

      let lastTxid: string = "";
      for (const signedTx of signedTxs) {
        lastTxid = consumeOrThrow(
          await this.provider.rpc.electrum.esplora_broadcastTx(signedTx),
        );
        await sleep(1000);
      }

      return new BoxedSuccess({
        waitForResult: async (): Promise<
          BoxedResponse<IDecodableAlkanesResponse<T>, AlkanesExecuteError>
        > => {
          try {
            const traceResult = consumeOrThrow(
              await this.provider.waitForTraceResult(lastTxid),
            );

            return new BoxedSuccess(
              new DecodableAlkanesResponse(traceResult.return, borshSchema),
            );
          } catch (err) {
            return new BoxedError(
              AlkanesExecuteError.UnknownError,
              "Wait for result failed: " + (err as Error).message,
            );
          }
        },
        txid: lastTxid,
      });
    } catch (err) {
      return new BoxedError(
        AlkanesExecuteError.UnknownError,
        "Push execute failed: " + (err as Error).message,
      );
    }
  };

  public async handleView<I extends Schema, O extends Schema>(
    opcode: bigint,
    arg: ResolveSchema<I>,
    inShape: I, // may or may not be a BorshSchema
    outShape: O, // may or may not be a BorshSchema
  ): Promise<BoxedResponse<ResolveSchema<O>, AlkanesSimulationError>> {
    try {
      let callData: bigint[] = [
        opcode, // opcode for Word Count
        ...consumeOrThrow(this.getEncodedCallData(arg, inShape)),
      ];

      let response = consumeOrThrow(
        await this.simulate({
          callData,
        }),
      );

      return new BoxedSuccess(
        consumeOrThrow(this.getDecodedResponse(response, outShape)),
      );
    } catch (error) {
      return new BoxedError(
        AlkanesSimulationError.UnknownError,
        "Simulation failed: " + (error as Error).message,
      );
    }
  }

  public async handleExecute<
    I extends Schema,
    K extends BorshSchema<unknown>,
    O extends Dec,
  >(
    address: string,
    opcode: bigint,
    arg: ResolveSchema<I>,
    argInscription: ResolveSchema<K> | undefined,
    inShape: I,
    inInscriptionShape: K | undefined, // may or may not be a BorshSchema
    outShape: O,
    txOpts?: Partial<ProtostoneTransactionOptions>,
  ): Promise<
    BoxedResponse<
      AlkanesPushExecuteResponse<ResolveSchema<O>>,
      AlkanesExecuteError
    >
  > {
    try {
      let inscription: AlkanesInscription<unknown> | undefined;
      if (argInscription && inInscriptionShape) {
        inscription = new AlkanesInscription(
          argInscription,
          inInscriptionShape,
        );
      }

      let callData: bigint[] = [
        opcode,
        ...consumeOrThrow(this.getEncodedCallData(arg, inShape)),
      ];

      const executePromise = isBorshSchema<BorshInfer<typeof outShape>>(
        outShape,
      )
        ? this.pushExecute<BorshInfer<typeof outShape>>(
            {
              address,
              callData,
              signPsbt: this.signPsbt,
              inscription,
              ...txOpts,
            },
            outShape,
          )
        : this.pushExecute({
            address,
            callData,
            signPsbt: this.signPsbt,
            inscription,
            ...txOpts,
          });

      const response = await executePromise;
      return response as BoxedResponse<
        AlkanesPushExecuteResponse<ResolveSchema<O>>,
        AlkanesExecuteError
      >;
    } catch (error) {
      return new BoxedError(
        AlkanesExecuteError.UnknownError,
        "Execution failed: " + (error as Error).message,
      );
    }
  }
}
