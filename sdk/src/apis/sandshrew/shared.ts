import { BoxedResponse, BoxedSuccess, BoxedError } from "@/boxed";

export enum RpcError {
  UnknownError = "UnknownError",
  InternalError = "InternalError",
}

export type RpcTuple = [string, unknown[]];

export type RpcResponse<T> = {
  jsonrpc: "2.0";
  id: number;
  result?: T;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
};

export interface RpcCall<T> {
  payload: RpcTuple;
  call: () => Promise<BoxedResponse<T, RpcError>>;
}

let rpcId = 0;
export function buildRpcCall<T, E = unknown>(
  method: string,
  params: unknown[] = [],
  url: string
): RpcCall<T> {
  const payload: RpcTuple = [method, params];

  const call = async (): Promise<BoxedResponse<T, RpcError>> => {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: rpcId, // anything unique
          method,
          params,
        }),
      });
      rpcId++;

      const responseBody = await res.text();

      if (!res.ok) {
        console.error(
          `RPC call failed: ${method} with params: ${JSON.stringify(
            params
          )}, status: ${res.status}, response: ${responseBody}`
        );
        return new BoxedError(RpcError.UnknownError, responseBody);
      }

      try {
        const json = JSON.parse(responseBody);

        if (json.error) {
          return new BoxedError(
            RpcError.InternalError,
            `Method ${method} with params ${params} failed with error: ${JSON.stringify(json.error)}`
          );
        }

        return new BoxedSuccess(json.result as T);
      } catch (e) {
        return new BoxedError(
          RpcError.UnknownError,
          `Failed to parse JSON response for method ${method} with params ${params}: ${responseBody}`
        );
      }
    } catch (err) {
      console.error(err);
      return new BoxedError(
        RpcError.UnknownError,
        (err as Error)?.message ?? "Unknown Error"
      );
    }
  };

  return { payload, call };
}
