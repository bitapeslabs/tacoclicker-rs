import { AlkanesParsedSimulationResult } from "./types";

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
