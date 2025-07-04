import { Provider } from "@/provider";
import { RunesAddressResult, RunesOutpointResult } from "./types";

export enum RunesFetchError {
  UnknownError = "UnknownError",
  RpcError = "RpcError",
}

export class RunesRpcProvider {
  constructor(private readonly provider: Provider) {}

  private get rpc() {
    return this.provider.buildRpcCall.bind(this.provider);
  }

  runes_getAddress(address: string, blockHeight: string = "latest") {
    return this.rpc<RunesAddressResult>("runes_address", [
      address,
      blockHeight,
    ]);
  }

  runes_getOutpoint(txidAndVout: string, blockHeight: string = "latest") {
    return this.rpc<RunesOutpointResult>("runes_outpoint", [
      txidAndVout,
      blockHeight,
    ]);
  }
}

export * from "./types";
