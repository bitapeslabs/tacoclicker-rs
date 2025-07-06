/* libs/interfaces/index.ts
   --------------------------------------------------------------- */
import {
  BoxedResponse,
  isBoxedError,
  BoxedSuccess,
  BoxedError,
  consumeOrThrow,
} from "@/boxed";
import { AlkanesTraceResult } from "@/apis";
import { Provider } from "@/provider";
import { Psbt } from "bitcoinjs-lib";
import { AlkanesTraceError } from "@/apis";
import { hexToUint8Array, sleep } from "@/utils";

export enum AlkanesSimulationError {
  UnknownError = "UnknownError",
}

export enum AlkanesExecuteError {
  UnknownError = "UnknownError",
}

/* A minimal description of the callable the provider exposes.
   Adapt it if your real Provider uses a richer signature. */
export type RpcCaller = <R = unknown>(
  method: string,
  params?: ReadonlyArray<unknown>
) => Promise<R>;

/* =================================================================
   1 ▸  CONTRACTS
   ================================================================ */
export interface IAlkanesContract<
  B extends IAlkanesBaseProvider<Record<string, any>>,
> {
  /** back-reference to the provider that created the contract */
  readonly base: B;
}
export type AlkanesPushExecuteResponse<K> = {
  result: K;
  txid: string;
};

export interface IAlkanesBaseProvider<
  CMap extends Record<string, IAlkanesContract<any>>,
> {
  readonly provider: Provider;
  signPsbt(unsignedBase64: string): Promise<string>;

  /** typed lookup by contract name */
  getContract<K extends keyof CMap>(name: K): CMap[K];

  waitForTraceResult(
    txid: string
  ): Promise<BoxedResponse<Uint8Array, AlkanesTraceError>>;
  pushExecute<K>(
    config: Parameters<Provider["execute"]>[0],
    decodeFn: (data: Uint8Array) => K
  ): Promise<BoxedResponse<AlkanesPushExecuteResponse<K>, AlkanesExecuteError>>;
}

/* =================================================================
   3 ▸  ABSTRACT HELPER CLASS FOR REAL PROVIDERS
   ================================================================ */
export abstract class AlkanesBaseProvider<
  CMap extends Record<string, IAlkanesContract<any>>,
> implements IAlkanesBaseProvider<CMap>
{
  private readonly contracts: Partial<CMap> = {};

  protected constructor(
    public readonly provider: Provider,
    private readonly signFn: (unsigned: string) => Promise<string>
  ) {}

  /*─────────────── external signer passthrough ────────────────*/
  signPsbt(unsigned: string): Promise<string> {
    return this.signFn(unsigned);
  }

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

  // prettier-ignore
  pushExecute = async <K>(
    config: Parameters<Provider["execute"]>[0],
    decodeFn: (data: Uint8Array) => K
  ): Promise<BoxedResponse<AlkanesPushExecuteResponse<K>, AlkanesExecuteError>> => {
    try {
      const unsignedPsbt = consumeOrThrow(await this.provider.execute(config));

      const signedPsbt = await this.signPsbt(unsignedPsbt.psbt);

      const tx = Psbt.fromBase64(signedPsbt, {
        network: this.provider.network,
      }).extractTransaction();

      const txid = consumeOrThrow(
        await this.provider.rpc.electrum.esplora_broadcastTx(tx.toHex())
      );

      const traceResult = consumeOrThrow(await this.waitForTraceResult(txid));

      return new BoxedSuccess({ result: decodeFn(traceResult), txid });
    } catch (err) {
      return new BoxedError(
        AlkanesExecuteError.UnknownError,
        "Push execute failed: " + (err as Error).message
      );
    }
  };

  /*─────────────── contract registration (one-time) ───────────*/
  protected registerContract<K extends keyof CMap>(
    name: K,
    Ctor: new (base: this) => CMap[K]
  ): void {
    this.contracts[name] = new Ctor(this);
  }

  /*─────────────── contract lookup ────────────────────────────*/
  getContract<K extends keyof CMap>(name: K): CMap[K];
  getContract(name: string): unknown;
  getContract(name: string): unknown {
    const c = this.contracts[name as keyof CMap];
    if (!c) throw new Error(`Contract “${name}” not registered`);
    return c;
  }
}

/* =================================================================
   4 ▸  OPTIONAL BASE CLASS FOR CONTRACTS
   ================================================================ */
export abstract class AlkanesContractBase<
  B extends IAlkanesBaseProvider<Record<string, any>>,
> implements IAlkanesContract<B>
{
  constructor(public readonly base: B) {}

  /** helper: strongly-typed RPC caller bound to the provider */
  protected get rpc() {
    return this.base.provider.buildRpcCall.bind(this.base.provider);
  }

  protected get execute() {
    return this.base.provider.execute.bind(this.base.provider);
  }

  protected get simulate() {
    return this.base.provider.simulate.bind(this.base.provider);
  }

  protected get trace() {
    return this.base.provider.trace.bind(this.base.provider);
  }

  protected signPsbt(unsigned: string): Promise<string> {
    return this.base.signPsbt(unsigned);
  }

  protected waitForTraceResult(
    txid: string
  ): Promise<BoxedResponse<Uint8Array, AlkanesTraceError>> {
    return this.base.waitForTraceResult(txid);
  }

  protected pushExecute<K>(
    config: Parameters<Provider["execute"]>[0],
    decodeFn: (data: Uint8Array) => K
  ): Promise<
    BoxedResponse<AlkanesPushExecuteResponse<K>, AlkanesExecuteError>
  > {
    return this.base.pushExecute(config, decodeFn);
  }
}

/* =================================================================
   5 ▸  (OPTIONAL) EXAMPLE — DELETE IN PRODUCTION
   ================================================================ */

/* Example contract */
export class CounterContract extends AlkanesContractBase<MySdkProvider> {
  async view_getCount() {
    let simulationResult = await this.simulate({ inputs: ["0", "1"] });

    if (isBoxedError(simulationResult)) {
      return simulationResult;
    }

    if (!simulationResult.data.parsed?.string) {
      return new BoxedError(
        AlkanesSimulationError.UnknownError,
        "No count found"
      );
    }

    return new BoxedSuccess(BigInt(simulationResult.data.parsed?.string));
  }

  async execute_increment(address: string) {
    const result = consumeOrThrow(
      await this.pushExecute({ address, callData: [1n] }, decodeToString)
    );

    return result;
  }
}

/* Concrete provider that wires contracts together */
export class MySdkProvider extends AlkanesBaseProvider<{
  counter: CounterContract;
}> {
  constructor(provider: Provider, signer: (u: string) => Promise<string>) {
    super(provider, signer);
    this.registerContract("counter", CounterContract);
  }
}
