/*─────────────────────────────────────────────────────────────
  DECODABLE ALKANES RESPONSE – single `decodeTo` API
──────────────────────────────────────────────────────────────*/
import { AlkanesSimulationResult, AlkanesTraceReturnEvent } from "@/apis";
import { hexToUint8Array } from "@/utils";
import { borshDeserialize, BorshSchema } from "borsher";

/*------------------------------------------------------------*
 | helpers                                                    |
 *------------------------------------------------------------*/
function bigintToLE(value: bigint, len = 16): Uint8Array {
  const out = new Uint8Array(len);
  let n = value;
  for (let i = 0; i < len; i++) {
    out[i] = Number(n & 0xffn);
    n >>= 8n;
  }
  return out;
}
function leBytesToBigint(bytes: Uint8Array): bigint {
  let n = 0n;
  for (let i = 0; i < bytes.length; i++) {
    n |= BigInt(bytes[i]) << (8n * BigInt(i));
  }
  return n;
}

/*------------------------------------------------------------*
 | decoder-function signatures – declared **once** here        |
 *------------------------------------------------------------*/
export interface DecoderFns<Obj> {
  string: (bytes: Uint8Array) => string;
  boolean: (bytes: Uint8Array) => boolean;
  bigint: (bytes: Uint8Array) => bigint;
  hex: (bytes: Uint8Array) => string;
  uint8Array: (bytes: Uint8Array) => Uint8Array;
  bigintArray: (bytes: Uint8Array) => bigint[];
  tokenValue: (bytes: Uint8Array) => number; // fixed-8
  object: (bytes: Uint8Array) => Obj; // Borsh
}

/** all legal strings accepted by `decodeTo` */
export type AvailableDecodeKind = keyof DecoderFns<unknown>; // → union of the keys above

/*------------------------------------------------------------*
 |  main class                                                |
 *------------------------------------------------------------*/
export class DecodableAlkanesResponse<T = unknown> {
  readonly bytes: Uint8Array;
  private readonly borshSchema?: BorshSchema<T>;

  /*──────────────────────────────────────────────────────────*/
  constructor(
    payload:
      | Uint8Array
      | bigint
      | AlkanesSimulationResult
      | AlkanesTraceReturnEvent["data"],
    schema?: BorshSchema<T>
  ) {
    this.borshSchema = schema;

    if (payload instanceof Uint8Array) {
      this.bytes = payload;
    } else if (typeof payload === "bigint") {
      this.bytes = bigintToLE(payload);
    } else if ("raw" in payload && payload.raw?.execution?.data) {
      this.bytes = hexToUint8Array(payload.raw.execution.data);
    } else if (
      "response" in payload &&
      typeof payload.response?.data === "bigint"
    ) {
      this.bytes = bigintToLE(payload.response.data);
    } else if (
      "response" in payload &&
      typeof payload.response?.data === "string"
    ) {
      this.bytes = hexToUint8Array(payload.response.data);
    } else {
      throw new Error("DecodableAlkanesResponse: unsupported payload shape");
    }
  }

  /*----------------------------------------------------------*
   | per-instance decoder table                               |
   *----------------------------------------------------------*/
  private decoderTable(): DecoderFns<T> {
    const base: Omit<DecoderFns<T>, "object"> = {
      string: (buf) => new TextDecoder().decode(buf),

      boolean: (buf) => {
        if (!buf.length) throw new Error("Empty buffer → boolean");
        return buf[0] !== 0;
      },

      bigint: leBytesToBigint,

      hex: (buf) =>
        Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join(""),

      uint8Array: (buf) => buf,

      bigintArray: (buf) => {
        const out: bigint[] = [];
        for (let i = 0; i < buf.length; i += 16) {
          out.push(leBytesToBigint(buf.subarray(i, i + 16)));
        }
        return out;
      },

      /** fixed-8 token ⇒ number */
      tokenValue: (buf) => {
        const raw = leBytesToBigint(buf); // e.g. satoshis
        const whole = raw / 100_000_000n;
        const frac = raw % 100_000_000n;
        return Number(whole) + Number(frac) / 1e8;
      },
    };

    return {
      ...base,
      object: (buf) => {
        if (!this.borshSchema) {
          throw new Error("decodeTo('object') needs a Borsh schema");
        }
        return borshDeserialize(this.borshSchema, buf);
      },
    };
  }

  /*----------------------------------------------------------*
   | PUBLIC  decodeTo                                         |
   *----------------------------------------------------------*/
  decodeTo<K extends AvailableDecodeKind>(
    kind: K
  ): ReturnType<DecoderFns<T>[K]> {
    const tbl = this.decoderTable() as DecoderFns<T>;
    // the cast is safe –  key is constrained by K
    return tbl[kind](this.bytes) as ReturnType<DecoderFns<T>[K]>;
  }
}

/* convenience alias for users that imported the old name */
export type IDecodableAlkanesResponse<T> = DecodableAlkanesResponse<T>;
