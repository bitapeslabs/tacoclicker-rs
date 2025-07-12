import type { Network as BitcoinNetwork } from "bitcoinjs-lib";
import {
  RpcCall,
  buildRpcCall as sandshrewBuildRpcCall,
} from "@/apis/sandshrew/shared";

import { AlkanesExecuteError, execute, simulate } from "@/libs/alkanes";
import {
  retryOnBoxedError,
  BoxedResponse,
  BoxedSuccess,
  BoxedError,
  isBoxedError,
  consumeOrThrow,
} from "@/boxed";

import {
  AlkanesRpcProvider,
  AlkanesTraceCreateEvent,
  AlkanesTraceInvokeEvent,
  AlkanesTraceReturnEvent,
  BaseRpcProvider,
  AlkanesTraceError,
  AlkanesTraceResult,
  IEsploraTransaction,
} from "./apis";

import { sleep } from "@/utils";
import { AlkanesSimulationError } from "./libs";

export interface ProviderConfig {
  sandshrewUrl: string;
  electrumApiUrl: string;
  network: BitcoinNetwork;
  explorerUrl: string;
  defaultFeeRate?: number;
  btcTicker?: string;
}

enum AlkanesPollError {
  UnknownError = "UnknownError",
}

export type AlkanesParsedTraceResult = {
  create?: AlkanesTraceCreateEvent["data"];
  invoke?: AlkanesTraceInvokeEvent["data"];
  return: AlkanesTraceReturnEvent["data"];
};

export class Provider {
  readonly sandshrewUrl: string;
  readonly electrumApiUrl: string;
  readonly network: BitcoinNetwork;
  readonly explorerUrl: string;
  readonly btcTicker: string;
  readonly rpc: BaseRpcProvider;
  readonly defaultFeeRate: number;
  private readonly TIMEOUT_MS = 60_000 * 5; // 5 minutes
  private readonly INTERVAL_MS = 5_000; // 5 seconds

  constructor(config: ProviderConfig) {
    this.sandshrewUrl = config.sandshrewUrl;
    this.electrumApiUrl = config.electrumApiUrl;
    this.network = config.network;
    this.explorerUrl = config.explorerUrl.replace(/\/+$/, "");
    this.btcTicker = config.btcTicker ?? "BTC";
    this.defaultFeeRate = config.defaultFeeRate ?? 5;

    this.rpc = new BaseRpcProvider(this);
  }

  protected txUrl(txid: string): string {
    return `${this.explorerUrl}/tx/${txid}`;
  }
  protected addressUrl(address: string): string {
    return `${this.explorerUrl}/address/${address}`;
  }

  buildRpcCall<T>(method: string, params: unknown[] = []): RpcCall<T> {
    return sandshrewBuildRpcCall<T>(method, params, this.sandshrewUrl);
  }

  execute(
    config: Omit<Parameters<typeof execute>[0], "provider">
  ): ReturnType<typeof execute> {
    return retryOnBoxedError({
      intervalMs: this.INTERVAL_MS,
      timeoutMs: this.TIMEOUT_MS,
    })(
      () => execute({ provider: this, ...config }),
      (attempt, res) => {
        console.warn(
          `EXECUTE: Attempt ${attempt + 1}: Failed to execute request (response: ${res.errorType + ": " + res.message}). Retrying...`
        );
      },
      [AlkanesExecuteError.UnknownError, AlkanesExecuteError.InvalidParams]
    );
  }
  simulate(
    request: Parameters<typeof simulate>[1]
  ): ReturnType<typeof simulate> {
    return retryOnBoxedError({
      intervalMs: this.INTERVAL_MS,
      timeoutMs: this.TIMEOUT_MS,
    })(
      () => simulate(this, request),
      (attempt, res) => {
        console.warn(
          `SIMULATE: Attempt ${attempt + 1}: Failed to simulate request (response: ${res.errorType + ": " + res.message}). Retrying...`
        );
      },
      [AlkanesSimulationError.TransactionReverted]
    );
  }

  trace(
    ...args: Parameters<typeof AlkanesRpcProvider.prototype.alkanes_trace>
  ): ReturnType<
    ReturnType<typeof AlkanesRpcProvider.prototype.alkanes_trace>["call"]
  > {
    return retryOnBoxedError({
      intervalMs: this.INTERVAL_MS,
      timeoutMs: this.TIMEOUT_MS,
    })(
      () => this.rpc.alkanes.alkanes_trace(...args).call(),
      (attempt, res) => {
        console.warn(
          `TRACE: Attempt ${attempt + 1}: Failed to fetch trace for txid: ${args[0]} (response: ${res.errorType + ": " + res.message}). Retrying...`
        );
      },
      [AlkanesTraceError.TransactionReverted, AlkanesTraceError.NoTraceFound]
    );
  }

  waitForTraceResult = async (
    txid: string
  ): Promise<BoxedResponse<AlkanesParsedTraceResult, AlkanesTraceError>> => {
    let tx = consumeOrThrow(
      await retryOnBoxedError({
        intervalMs: 1000,
        timeoutMs: 10000,
      })(() => this.rpc.electrum.esplora_gettransaction(txid))
    );

    let result: AlkanesParsedTraceResult | undefined = undefined;
    let maxAttempts = 300;
    while (result === undefined) {
      let traceResults = await Promise.all([
        this.trace(txid, tx.vout.length + 1),
        this.trace(txid, tx.vout.length + 2),
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
        const createEvent = success.find((e) => e.event === "create");
        const invokeEvent = success.find((e) => e.event === "invoke")!; //There will always be an invoke event
        const returnEvent = success.findLast((e) => e.event === "return")!; //There will always be a return event
        result = {
          create: createEvent?.data as AlkanesTraceCreateEvent["data"],
          invoke: invokeEvent?.data as AlkanesTraceInvokeEvent["data"],
          return: returnEvent?.data as AlkanesTraceReturnEvent["data"],
        };
      }

      if (maxAttempts-- <= 0) {
        return new BoxedError(
          AlkanesTraceError.NoTraceFound,
          "No trace found for the given txid after 300 attempts"
        );
      }

      await sleep(2000);
    }
    return new BoxedSuccess(result);
  };

  waitForConfirmation = async (
    txid: string
  ): Promise<BoxedResponse<boolean, AlkanesPollError>> => {
    try {
      let tx: IEsploraTransaction | undefined = undefined;
      while (!tx?.status.confirmed) {
        tx = consumeOrThrow(
          await retryOnBoxedError({
            intervalMs: 1000,
            timeoutMs: 10000,
          })(() => this.rpc.electrum.esplora_gettransaction(txid))
        );

        if (tx?.status.confirmed) break;
        await sleep(4_000);
      }
      return new BoxedSuccess(true);
    } catch (err) {
      return new BoxedError(
        AlkanesPollError.UnknownError,
        "An error ocurred while waiting for tx confirmation: " +
          (err as Error).message
      );
    }
  };
}
