import { AlkanesParsedSimulationResult } from "./types";
import { AlkanesTraceEncodedResult, AlkanesTraceResult } from "./types";
export const stripHex = (s: string) => (s.startsWith("0x") ? s.slice(2) : s);

export function mapToPrimitives(v: any): any {
  switch (typeof v) {
    case "bigint":
      return "0x" + v.toString(16);
    case "object": {
      if (v === null) return null;
      if (Buffer.isBuffer(v)) return "0x" + v.toString("hex");
      if (Array.isArray(v)) return v.map(mapToPrimitives);
      return Object.fromEntries(
        Object.entries(v).map(([k, val]) => [k, mapToPrimitives(val)])
      );
    }
    default:
      return v;
  }
}

export function unmapFromPrimitives(v: any): any {
  switch (typeof v) {
    case "string":
      if (v.startsWith("0x") && v !== "0x")
        return Buffer.from(stripHex(v), "hex");
      if (!isNaN(v as any)) return BigInt(v);
      return v;
    case "object": {
      if (v === null) return null;
      if (Array.isArray(v)) return v.map(unmapFromPrimitives);
      return Object.fromEntries(
        Object.entries(v).map(([k, val]) => [k, unmapFromPrimitives(val)])
      );
    }
    default:
      return v;
  }
}

export function parseSimulateReturn(
  v: string
): AlkanesParsedSimulationResult | undefined {
  if (v === "0x") return undefined;

  const toUtf8 = Buffer.from(stripHex(v), "hex").toString("utf8");
  const isUtf8 = !/[\uFFFD]/.test(toUtf8);

  const rev = Buffer.from(
    Array.from(Buffer.from(stripHex(v), "hex")).reverse()
  ).toString("hex");

  return {
    string: isUtf8 ? toUtf8 : "0x" + stripHex(v),
    bytes: "0x" + stripHex(v),
    le: BigInt("0x" + rev).toString(),
    be: BigInt("0x" + stripHex(v)).toString(),
  };
}

function hexLEToBigInt(hex: string): bigint {
  if (!/^0x[0-9a-fA-F]+$/.test(hex)) {
    throw new Error(`Invalid hex string: ${hex}`);
  }

  let raw = hex.slice(2); // strip `0x`
  if (raw.length % 2 !== 0) raw = "0" + raw; // make even length

  // reverse byte order (little-endian → big-endian)
  let be = "";
  for (let i = 0; i < raw.length; i += 2) {
    be = raw.substring(i, i + 2) + be;
  }
  return BigInt("0x" + be);
}

/**
 * Recursively walks a structure and converts every *hex string* (`/^0x[0-9a-f]+$/i`)
 * it finds into a `bigint` via `hexLEToBigInt`.
 */
function deepHexToBigInt<T>(value: T): unknown {
  if (Array.isArray(value)) {
    return value.map(deepHexToBigInt);
  }

  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = deepHexToBigInt(v as never);
    }
    return out;
  }

  if (typeof value === "string" && /^0x[0-9a-fA-F]+$/.test(value)) {
    return hexLEToBigInt(value);
  }

  return value;
}

/**
 * Top-level helper that takes an encoded trace and returns a fully-decoded trace,
 * where every little-endian hex string has become a `bigint`.
 */
export function decodeAlkanesTrace(
  encoded: AlkanesTraceEncodedResult
): AlkanesTraceResult {
  // `deepHexToBigInt` already returns data in the correct shape,
  // but TS needs a cast to satisfy the compiler.
  const decoded = deepHexToBigInt(encoded) as unknown as AlkanesTraceResult;
  return decoded;
}
