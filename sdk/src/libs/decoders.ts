import { AlkanesSimulationResult } from "@/apis";
import { hexToUint8Array } from "@/utils";

export class DecodableAlkanesResponse {
  public readonly bytes: Uint8Array;

  constructor(payload: Uint8Array | AlkanesSimulationResult) {
    if (payload instanceof Uint8Array) {
      this.bytes = payload;
    } else if (payload?.parsed?.bytes) {
      this.bytes = hexToUint8Array(payload.parsed.bytes);
    } else {
      throw new Error("Invalid payload type for Decodable");
    }
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
}
