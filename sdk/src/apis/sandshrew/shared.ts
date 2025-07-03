import { BoxedResponse, BoxedSuccess, BoxedError } from "@/boxed";
import { ALKANES_PROVIDER } from "@/consts";

export enum RpcError {
  UnknownError = "UnknownError",
}

export type RpcTuple = [string, unknown[]];

export interface RpcCall<T> {
  payload: RpcTuple;
  call: () => Promise<BoxedResponse<T, RpcError>>;
}

export function buildRpcCall<T, E = unknown>(
  method: string,
  params: unknown[] = []
): RpcCall<T> {
  const payload: RpcTuple = [method, params];

  const call = async (): Promise<BoxedResponse<T, RpcError>> => {
    try {
      const res = await fetch(ALKANES_PROVIDER.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: Date.now(), // anything unique
          method,
          params,
        }),
      });

      const json = await res.json();
      if (json.error) {
        return new BoxedError(
          RpcError.UnknownError,
          typeof json.error === "string" ? json.error : json.error.message
        );
      }
      return new BoxedSuccess(json.result as T);
    } catch (err) {
      return new BoxedError(
        RpcError.UnknownError,
        (err as Error)?.message ?? "Unknown Error"
      );
    }
  };

  return { payload, call };
}
