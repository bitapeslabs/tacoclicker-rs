/*─────────────────────────────────────────────────────────────
  ENCODABLE  – single `encodeTo` API (symmetrical with decodeTo)
──────────────────────────────────────────────────────────────*/
import { BoxedResponse, BoxedSuccess, BoxedError } from "@/boxed";
import { borshSerialize, BorshSchema } from "borsher";
import { Expand } from "@/utils";

/*------------------------------------------------------------*
 | 1.  low-level helpers                                       |
 *------------------------------------------------------------*/
function encodeStringToU128Array(text: string): bigint[] {
  const bytes = new TextEncoder().encode(text);
  const out: bigint[] = [];

  for (let off = 0; off < bytes.length; off += 16) {
    const chunk = bytes.subarray(off, off + 16);
    const buf = new Uint8Array(16);
    buf.set(chunk);

    let word = 0n;
    for (let i = 0; i < 16; i++) {
      word |= BigInt(buf[i]) << (8n * BigInt(i));
    }
    out.push(word);
  }
  return out;
}

function encodeBytesToU128Array(data: Uint8Array): bigint[] {
  const out: bigint[] = [];
  for (let off = 0; off < data.length; off += 16) {
    const buf = new Uint8Array(16);
    buf.set(data.subarray(off, off + 16));

    let word = 0n;
    for (let i = 0; i < 16; i++) {
      word |= BigInt(buf[i]) << (8n * BigInt(i));
    }
    out.push(word);
  }
  return out;
}

/*------------------------------------------------------------*
 | 2.  error enum                                              |
 *------------------------------------------------------------*/
export enum EncodeError {
  InvalidPayload = "Invalid payload type",
  NameTooLong = "Name payload exceeds 2 × u128",
  CharTooLong = "Char payload exceeds 1 × u128",
  BorshMissing = "Borsh schema is required for object serialization",
}

/*------------------------------------------------------------*
 | 3.  encode-kind table                                       |
 *------------------------------------------------------------*/
export interface EncoderFns<Obj> {
  string: (data: unknown) => BoxedResponse<bigint[], EncodeError>;
  name: (data: unknown) => BoxedResponse<bigint[], EncodeError>;
  char: (data: unknown) => BoxedResponse<bigint[], EncodeError>;
  object: (data: unknown, schema?: BorshSchema<Obj>) => BoxedResponse<bigint[], EncodeError>;
}

export type AvailableEncodeKind = keyof EncoderFns<unknown>;

export class Encodable<T = unknown> {
  constructor(
    public readonly payload: unknown,
    private readonly borshSchema?: BorshSchema<T>,
  ) {}

  /* per-instance encoder table */
  private encoderTable(): EncoderFns<T> {
    return {
      string: (data) => {
        if (typeof data !== "string") {
          return new BoxedError(EncodeError.InvalidPayload, "Payload must be a string");
        }
        return new BoxedSuccess(encodeStringToU128Array(data));
      },

      name: (data) => {
        if (typeof data !== "string") {
          return new BoxedError(EncodeError.InvalidPayload, "Payload must be a string");
        }
        const arr = encodeStringToU128Array(data);
        if (arr.length > 2) return new BoxedError(EncodeError.NameTooLong);
        if (arr.length === 1) arr.push(0n); // right-pad
        return new BoxedSuccess(arr);
      },

      char: (data) => {
        if (typeof data !== "string") {
          return new BoxedError(EncodeError.InvalidPayload, "Payload must be a string");
        }
        const arr = encodeStringToU128Array(data);
        if (arr.length > 1) return new BoxedError(EncodeError.CharTooLong);
        return new BoxedSuccess(arr);
      },

      object: (data, schema) => {
        if (!schema) {
          return new BoxedError(EncodeError.BorshMissing, "Missing Borsh schema");
        }
        const bytes = borshSerialize(schema, data);
        return new BoxedSuccess(encodeBytesToU128Array(bytes));
      },
    };
  }

  encodeFrom<K extends AvailableEncodeKind>(kind: K): BoxedResponse<bigint[], EncodeError> {
    const table = this.encoderTable() as EncoderFns<T>;
    return table[kind](this.payload, this.borshSchema);
  }
}

/* convenience alias (mirrors IDecodableAlkanesResponse) */
export type IEncodable<T> = Expand<Encodable<T>>;
