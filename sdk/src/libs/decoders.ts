import { AlkanesSimulationResult, AlkanesTraceReturnEvent } from "@/apis";
import { hexToUint8Array } from "@/utils";
import { Expand } from "@/utils";

import { borshDeserialize, BorshSchema } from "borsher";

function bigintToBytesLE(num: bigint, byteLength: number): Uint8Array {
  const bytes = new Uint8Array(byteLength);
  let n = num;

  for (let i = 0; i < byteLength; i++) {
    bytes[i] = Number(n & 0xffn);
    n >>= 8n;
  }

  return bytes;
}
export class DecodableAlkanesResponse<T> {
  public readonly bytes: Uint8Array;
  public readonly borshSchema?: BorshSchema<T>;

  constructor(
    payload:
      | Uint8Array
      | bigint
      | AlkanesSimulationResult
      | AlkanesTraceReturnEvent["data"], // ← only the nested `data`
    borshSchema?: BorshSchema<T>
  ) {
    this.borshSchema = borshSchema;

    // 1. Already-binary
    if (payload instanceof Uint8Array) {
      this.bytes = payload;
      return;
    }

    // 2. BigInt → 16-byte little-endian
    if (typeof payload === "bigint") {
      this.bytes = bigintToBytesLE(payload, 16);
      return;
    }

    // Tiny helper so we only write the conversion once
    const toBytes = (hex: string): Uint8Array => hexToUint8Array(hex);

    // 3. Simulation result (hex lives at raw.execution.data)
    if ("raw" in payload && typeof payload.raw?.execution?.data === "string") {
      this.bytes = toBytes(payload.raw.execution.data);
      return;
    }

    // 4. Trace-return *data* (hex lives at response.data)
    if ("response" in payload && typeof payload.response?.data === "bigint") {
      this.bytes = bigintToBytesLE(payload.response.data, 16);
      return;
    }

    throw new Error("DecodableAlkanesResponse: unsupported payload shape");
  }

  toString(): string {
    return new TextDecoder().decode(this.bytes);
  }

  toStringArray(delimiter: string | RegExp = "\0"): string[] {
    const text = this.toString();
    const parts = text.split(delimiter).filter(Boolean);
    return parts;
  }

  toBoolean(): boolean {
    if (this.bytes.length === 0) {
      throw new Error("Cannot decode empty buffer as boolean");
    }
    return this.bytes[0] !== 0;
  }

  toBigInt(): bigint {
    let value = 0n;
    for (let i = 0; i < this.bytes.length; i++) {
      value |= BigInt(this.bytes[i]) << (8n * BigInt(i));
    }
    return value;
  }

  toTokenValue(decimals: number): number {
    const value = this.toBigInt();
    let wholeValue = value / BigInt(10 ** decimals);
    let fractionalValue = value % BigInt(10 ** decimals);

    return Number(wholeValue) + Number(fractionalValue) / 10 ** decimals;
  }

  toBigIntArray(): bigint[] {
    const out: bigint[] = [];
    for (let offset = 0; offset < this.bytes.length; offset += 16) {
      const chunk = this.bytes.subarray(offset, offset + 16);
      out.push(DecodableAlkanesResponse.leBytesToBigInt(chunk));
    }
    return out;
  }

  private static leBytesToBigInt(bytes: Uint8Array): bigint {
    let v = 0n;
    for (let i = 0; i < bytes.length; i++) {
      v |= BigInt(bytes[i]) << (8n * BigInt(i));
    }
    return v;
  }

  toUint8Array(): Uint8Array {
    return this.bytes;
  }

  toHex(): string {
    return Array.from(this.bytes)
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }

  toObject(): T {
    if (!this.borshSchema) {
      throw new Error("Borsh deserialization function not provided");
    }
    return borshDeserialize(this.borshSchema, this.bytes);
  }
}

export type IDecodableAlkanesResponse<T> = Expand<DecodableAlkanesResponse<T>>;
