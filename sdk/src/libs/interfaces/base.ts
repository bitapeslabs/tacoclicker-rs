import {
  BoxedResponse,
  isBoxedError,
  BoxedSuccess,
  BoxedError,
  consumeOrThrow,
} from "@/boxed";
import { AlkaneId, AlkanesTraceResult } from "@/apis";
import { Provider } from "@/provider";
import { Psbt } from "bitcoinjs-lib";
import { AlkanesTraceError } from "@/apis";
import { hexToUint8Array, sleep } from "@/utils";
import { AlkanesExecuteError } from "../alkanes";
export enum AlkanesSimulationError {
  UnknownError = "UnknownError",
}

export type AlkanesPushExecuteResponse<K> = {
  result: K;
  txid: string;
};

export abstract class AlkanesBaseContract {
  constructor(
    protected readonly provider: Provider,
    protected readonly alkaneId: AlkaneId,
    private readonly signPsbtFn: (unsigned: string) => Promise<string>
  ) {}

  /*─────────────── thin helpers around Provider ───────────────*/
  protected get rpc() {
    return this.provider.buildRpcCall.bind(this.provider);
  }
  protected get execute() {
    return this.provider.execute.bind(this.provider);
  }
  protected get simulate() {
    return this.provider.simulate.bind(this.provider);
  }
  protected get trace() {
    return this.provider.trace.bind(this.provider);
  }

  protected signPsbt(unsigned: string) {
    return this.signPsbtFn(unsigned);
  }

  /*─────────────── trace-poller ───────────────*/
  waitForTraceResult = async (
    txid: string
  ): Promise<BoxedResponse<Uint8Array, AlkanesTraceError>> => {
    let traceResult: string | undefined = undefined;
    let maxAttempts = 300;
    while (traceResult === undefined) {
      let traceResults = await Promise.all([
        this.provider.trace(txid, 3),
        this.provider.trace(txid, 4),
      ]);

      let errors = traceResults.filter(isBoxedError);
      let success = (
        traceResults.filter((result) => !isBoxedError(result)) as
          | BoxedSuccess<AlkanesTraceResult>[]
          | undefined
      )?.[0]?.data;

      let revertError = errors.find(
        (result) => result.errorType === AlkanesTraceError.TransactionReverted
      );
      if (revertError) {
        return revertError;
      }

      if (success) {
        let returnEvent = success.find(
          (traceEvent) => traceEvent.event === "return"
        )!; //there is always a return event in the trace

        traceResult = returnEvent?.data.response.data;
      }

      if (maxAttempts-- <= 0) {
        return new BoxedError(
          AlkanesTraceError.NoTraceFound,
          "No trace found for the given txid after 300 attempts"
        );
      }

      await sleep(2000);
    }
    return new BoxedSuccess(hexToUint8Array(traceResult));
  };

  pushExecute = async <K = Uint8Array>(
    config: Parameters<Provider["execute"]>[0],
    decodeFn?: (data: Uint8Array) => K
  ): Promise<
    BoxedResponse<AlkanesPushExecuteResponse<K>, AlkanesExecuteError>
  > => {
    try {
      const unsignedPsbt = consumeOrThrow(
        await this.provider.execute({
          ...config,
          callData: [this.alkaneId.block, this.alkaneId.tx, ...config.callData],
        })
      );

      const signedPsbt = await this.signPsbt(unsignedPsbt.psbt);

      const tx = Psbt.fromBase64(signedPsbt, {
        network: this.provider.network,
      }).extractTransaction();

      const txid = consumeOrThrow(
        await this.provider.rpc.electrum.esplora_broadcastTx(tx.toHex())
      );

      const traceResult = consumeOrThrow(await this.waitForTraceResult(txid));

      return new BoxedSuccess({
        result: decodeFn
          ? decodeFn(traceResult)
          : (traceResult as unknown as K),
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
