import { BoxedResponse, BoxedSuccess, BoxedError } from "@/boxed";
import { Expand } from "@/utils";
import { borshSerialize, BorshSchema } from "borsher";
function encodeStringToU128Array(str: string): bigint[] {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);

  const u128s: bigint[] = [];

  for (let offset = 0; offset < data.length; offset += 16) {
    // Take a 16-byte window (slice shorter at EOF)
    const chunk = data.subarray(offset, offset + 16);

    // Pad to 16 bytes on the right with zeros
    const buf = new Uint8Array(16);
    buf.set(chunk);

    // Convert little-endian bytes -> BigInt
    let n = 0n;
    for (let i = 0; i < 16; i++) {
      n |= BigInt(buf[i]) << (8n * BigInt(i)); // 256-base place value
    }

    u128s.push(n);
  }

  return u128s;
}

function encodeUintArrayToU128Array(data: Uint8Array | number[]): bigint[] {
  const bytes = data instanceof Uint8Array ? data : Uint8Array.from(data);

  const u128s: bigint[] = [];

  for (let offset = 0; offset < bytes.length; offset += 16) {
    const chunk = bytes.subarray(offset, offset + 16);

    // Zero-pad to a full 16-byte buffer
    const buf = new Uint8Array(16);
    buf.set(chunk);

    let word = 0n;
    for (let i = 0; i < 16; i++) {
      word |= BigInt(buf[i]) << (8n * BigInt(i));
    }

    u128s.push(word);
  }

  return u128s;
}

enum EncodeError {
  InvalidPayload = "Invalid payload type",
}

export class Encodable<T> {
  public readonly payload: unknown;
  public readonly borshSchema?: BorshSchema<T>;

  constructor(payload: unknown, borshSchema?: BorshSchema<T>) {
    this.payload = payload;
    this.borshSchema = borshSchema;
  }

  fromString(): BoxedResponse<bigint[], EncodeError> {
    if (typeof this.payload !== "string") {
      return new BoxedError(
        EncodeError.InvalidPayload,
        "Payload must be a string"
      );
    }
    return new BoxedSuccess(encodeStringToU128Array(this.payload));
  }

  fromName(): BoxedResponse<bigint[], EncodeError> {
    if (typeof this.payload !== "string") {
      return new BoxedError(
        EncodeError.InvalidPayload,
        "Payload must be a string"
      );
    }
    let result = encodeStringToU128Array(this.payload);

    if (result.length > 2) {
      return new BoxedError(
        EncodeError.InvalidPayload,
        "Payload must be a name (max 2 u128s)"
      );
    }

    if (result.length === 1) {
      result.push(0n); // pad with zero if only one u128
    }
    return new BoxedSuccess(result);
  }

  fromChar(): BoxedResponse<bigint[], EncodeError> {
    if (typeof this.payload !== "string") {
      return new BoxedError(
        EncodeError.InvalidPayload,
        "Payload must be a string"
      );
    }

    let result = encodeStringToU128Array(this.payload);

    if (result.length > 1) {
      return new BoxedError(
        EncodeError.InvalidPayload,
        "Payload must be a single character (max 1 u128)"
      );
    }

    return new BoxedSuccess(result);
  }

  fromObject(): BoxedResponse<bigint[], EncodeError> {
    if (!this.borshSchema) {
      return new BoxedError(
        EncodeError.InvalidPayload,
        "Borsh schema is required for object serialization"
      );
    }

    return new BoxedSuccess(
      encodeUintArrayToU128Array(borshSerialize(this.borshSchema, this.payload))
    );
  }
}

export type IEncodable = Expand<(typeof Encodable)["prototype"]>;
