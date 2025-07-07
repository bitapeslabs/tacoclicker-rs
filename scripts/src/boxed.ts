/*
  These error types are to be propagated throughout the backend. Every consumer of a function that returns
  a BoxedResponse needs to properly handle the consumed functions error types. This pattern is one of the
  hardcoded rules of our code structure design patterns, this MUST be followed.
*/

/** Represents just the error shape (status: false) */
export interface IBoxedError<E extends string | number> {
  status: false;
  errorType: E;
  message?: string;
}

/** Represents just the success shape (status: true) */
export interface IBoxedSuccess<T> {
  status: true;
  data: T;
}

/** A union that can be either an error or a success */
export type BoxedResponse<T, E extends string | number> =
  | IBoxedError<E>
  | IBoxedSuccess<T>;

/** A class implementing the error shape */
export class BoxedError<E extends string | number> implements IBoxedError<E> {
  public status: false = false;
  public errorType: E;
  public message?: string;

  constructor(errorType: E, message?: string) {
    this.message = message;
    this.errorType = errorType;
  }
}

/** A class implementing the success shape */
export class BoxedSuccess<T> implements IBoxedSuccess<T> {
  public status: true = true;
  public data: T;

  constructor(data: T) {
    this.data = data;
  }
}

/**
 * Type guard checking if a BoxedResponse is a BoxedError
 */
export function isBoxedError<T, E extends string | number>(
  response: BoxedResponse<T, E>
): response is IBoxedError<E> {
  return response.status === false;
}

export function consumeOrThrow<T, E extends string | number>(
  response: BoxedResponse<T, E>
): T {
  if (isBoxedError(response)) {
    throw new Error(
      `BoxedError: ${response.errorType} - ${
        response.message || "No message provided"
      }`
    );
  }
  return response.data;
}

export function consumeOrNull<T, E extends string | number>(
  response: BoxedResponse<T, E>
): T | null {
  if (isBoxedError(response)) {
    return null;
  }
  return response.data;
}

export function consumeOrCallback<T, E extends string | number>(
  response: BoxedResponse<T, E>,
  callback: (error: IBoxedError<E>) => T
): T {
  if (isBoxedError(response)) {
    return callback(response);
  }
  return response.data;
}

export function consumeUntilSuccess<T, E extends string | number>(
  response: BoxedResponse<T, E>,
  interval: number,
  maxAttempts?: number
): Promise<BoxedResponse<T, E>> {
  maxAttempts = maxAttempts ?? 10; // Default to 10 attempts if not provided
  return new Promise((resolve) => {
    let attempts = 0;

    const intervalId = setInterval(() => {
      if (isBoxedError(response)) {
        if (maxAttempts && attempts >= maxAttempts) {
          clearInterval(intervalId);
          resolve(response);
        } else {
          attempts++;
        }
      } else {
        clearInterval(intervalId);
        resolve(response);
      }
    }, interval);
  });
}

type IBoxedRetryOpts = {
  intervalMs?: number;
  timeoutMs?: number;
};

const DEFAULT_INTERVAL = 1000;
const DEFAULT_TIMEOUT = 10000;
export function retryOnBoxedError(timeOpts?: IBoxedRetryOpts) {
  const interval = timeOpts?.intervalMs ?? DEFAULT_INTERVAL;
  const timeout = timeOpts?.timeoutMs ?? DEFAULT_TIMEOUT;

  return async function <T, E extends string | number>(
    fn: () => Promise<BoxedResponse<T, E>>,
    onRetry?: (attempt: number, err: BoxedError<E>, fnName: string) => void,
    returnErrors: E[] = []
  ): Promise<BoxedResponse<T, E>> {
    const errorSet = new Set(returnErrors);
    const start = Date.now();
    let attempt = 0;

    while (Date.now() - start < timeout) {
      const res = await fn();
      if (
        !isBoxedError(res) ||
        (isBoxedError(res) && errorSet.has(res.errorType)) //Will skip onretry aswell
      )
        return res;

      onRetry?.(attempt, res, fn.name);
      attempt++;
      await new Promise((r) => setTimeout(r, interval));
    }

    return new BoxedError<E>(
      "TimeoutError" as E,
      `Function did not succeed within ${timeout} ms`
    );
  };
}

// -----------------------------------------------------------------------------
// retryOrThrow  – timeOpts?  →  <T,E>(fn, onRetry?) => Promise<T>
// -----------------------------------------------------------------------------
export function retryOrThrow(timeOpts?: IBoxedRetryOpts) {
  return async function <T, E extends string | number>(
    fn: () => Promise<BoxedResponse<T, E>>,
    onRetry?: (attempt: number, err: BoxedError<E>, fnName: string) => void
  ): Promise<T> {
    const resp = await retryOnBoxedError(timeOpts)<T, E>(fn, onRetry);
    return consumeOrThrow(resp);
  };
}

type SuccessPayload<T> = T extends IBoxedSuccess<infer R> //  ← matches status: true
  ? R
  : never;

/* ────────────────────────────────────────────────────────────── */
/* 2.  Tuple-aware consumer — still zero `any`                    */
/* ────────────────────────────────────────────────────────────── */

export function consumeAll<
  const T extends readonly BoxedResponse<unknown, string | number>[]
>(
  tuple: T,
  consumeFn: <U, E extends string | number>(
    boxed: BoxedResponse<U, E>
  ) => U = consumeOrThrow
): { [K in keyof T]: SuccessPayload<T[K]> } {
  // run the consumer for every element
  const out = tuple.map(consumeFn);
  // re-tag the array as the same-length tuple
  return out as unknown as { [K in keyof T]: SuccessPayload<T[K]> };
}
