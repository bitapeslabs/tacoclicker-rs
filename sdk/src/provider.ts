import type { Network as BitcoinNetwork } from "bitcoinjs-lib";
import {
  RpcCall,
  RpcTuple,
  buildRpcCall as sandshrewBuildRpcCall,
} from "@/apis/sandshrew/shared";

import { execute, simulate } from "@/libs/alkanes";

import { AlkanesRpcProvider, BaseRpcProvider } from "./apis";

export interface ProviderConfig {
  sandshrewUrl: string;
  electrumApiUrl: string;
  network: BitcoinNetwork;
  explorerUrl: string;
  defaultFeeRate?: number;
  btcTicker?: string;
}

export class Provider {
  readonly sandshrewUrl: string;
  readonly electrumApiUrl: string;
  readonly network: BitcoinNetwork;
  readonly explorerUrl: string;
  readonly btcTicker: string;
  readonly rpc: BaseRpcProvider;
  readonly defaultFeeRate: number;

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
    return execute({ provider: this, ...config });
  }
  simulate(
    request: Parameters<typeof simulate>[1]
  ): ReturnType<typeof simulate> {
    return simulate(this, request);
  }

  trace(
    ...args: Parameters<typeof AlkanesRpcProvider.prototype.alkanes_trace>
  ): ReturnType<
    ReturnType<typeof AlkanesRpcProvider.prototype.alkanes_trace>["call"]
  > {
    return this.rpc.alkanes.alkanes_trace(...args).call();
  }
}
