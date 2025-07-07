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
  fields: (keyof T)[]
): K {
  const filtered: Partial<T> = {};
  for (const key in obj) {
    if (!fields.includes(key)) {
      filtered[key] = obj[key];
    }
  }
  return filtered as K;
}
