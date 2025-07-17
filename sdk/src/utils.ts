import { AlkaneId } from "./apis";
import { ISchemaAlkaneId } from "./libs/schemas";

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export function hexToUint8Array(hex: string): Uint8Array {
  if (hex.startsWith("0x")) hex = hex.slice(2);
  if (hex.length % 2 !== 0) throw new Error("Invalid hex string");

  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}
export function excludeFields<K, T extends object>(
  obj: T,
  fields: (keyof T)[],
): K {
  const filtered: Partial<T> = {};
  for (const key in obj) {
    if (!fields.includes(key)) {
      filtered[key] = obj[key];
    }
  }
  return filtered as K;
}
export type Expand<T> = T extends infer O ? { [K in keyof O]: O[K] } : never;

export class ParsableAlkaneId {
  constructor(public readonly alkaneId: AlkaneId | ISchemaAlkaneId) {}

  toSchemaAlkaneId(): ISchemaAlkaneId {
    return {
      block: Number(this.alkaneId.block),
      tx: BigInt(this.alkaneId.tx),
    };
  }

  toAlkaneId(): AlkaneId {
    return {
      block: BigInt(this.alkaneId.block),
      tx: BigInt(this.alkaneId.tx),
    };
  }
}

export function reverseHexBytes(hex: string): string {
  // Sanitize input
  if (hex.startsWith("0x")) hex = hex.slice(2);
  if (hex.length % 2 !== 0) throw new Error("Hex string must have even length");

  const len = hex.length / 2;
  const reversedBytes = new Uint8Array(len);

  for (let i = 0; i < len; i++) {
    const byte = hex.slice(hex.length - 2 * (i + 1), hex.length - 2 * i);
    reversedBytes[i] = parseInt(byte, 16);
  }

  const reversedHex = Array.from(reversedBytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return reversedHex;
}
