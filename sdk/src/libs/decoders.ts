import { AlkanesSimulationResult } from "@/apis";
import { BoxedError, BoxedResponse, BoxedSuccess } from "@/boxed";
import { AlkanesSimulationError } from "./interfaces";
import { hexToUint8Array } from "@/utils";

export function decodeToString(bytes: Uint8Array): string {
  // Reverse the byte order (LE → BE for decoding)
  const reversed = new Uint8Array(bytes).reverse();

  // Decode as UTF-8
  return new TextDecoder().decode(reversed);
}

export function decodeU128ToString(value: bigint): string {
  // Guard against overflow/underflow
  const MAX_U128 = (1n << 128n) - 1n;
  if (value < 0n || value > MAX_U128) {
    throw new RangeError("Value is outside the u128 range");
  }

  // 1. Write the bigint to 16 little-endian bytes
  const bytesLE = new Uint8Array(16);
  let tmp = value;
  for (let i = 0; i < 16; i++) {
    bytesLE[i] = Number(tmp & 0xffn);
    tmp >>= 8n;
  }

  // 2. Strip zero bytes (the Rust code kept the original order)
  const filtered = bytesLE.filter((b) => b !== 0);

  // 3. Decode as UTF-8
  return new TextDecoder().decode(filtered);
}

export function decodeU128sToString(u128s: bigint[]): string {
  return u128s.map((u128) => decodeU128ToString(u128)).join("");
}

export function decodeBigIntFromLEBytes(bytes: Uint8Array): bigint {
  let result = 0n;
  for (let i = 0; i < bytes.length; i++) {
    result |= BigInt(bytes[i]) << (8n * BigInt(i));
  }
  return result;
}

/**
 * Encodes a UTF-8 string into one or more little-endian u128s (BigInts).
 * The byte stream is chunked in 16-byte blocks; the final block is
 * right-padded with zeros to 16 bytes if needed.
 *
 * The inverse of `u128ToString` **only if** the source string never
 * contained a zero byte (U+0000) and you ignore the fact that that
 * function discards zeros on the way back.
 */

export function decodeU128sFromLeHexString(hex: string): bigint[] {
  // Remove optional "0x" prefix
  if (hex.startsWith("0x")) hex = hex.slice(2);

  if (hex.length % 32 !== 0) {
    throw new Error(
      "Hex string must be a multiple of 32 characters (16 bytes per u128)"
    );
  }

  const u128s: bigint[] = [];

  for (let i = 0; i < hex.length; i += 32) {
    const chunk = hex.slice(i, i + 32);
    const bytes = new Uint8Array(16);

    for (let j = 0; j < 16; j++) {
      bytes[j] = parseInt(chunk.slice(j * 2, j * 2 + 2), 16);
    }

    // Convert little-endian bytes to bigint
    let value = 0n;
    for (let k = 0; k < 16; k++) {
      value |= BigInt(bytes[k]) << (8n * BigInt(k));
    }

    u128s.push(value);
  }

  return u128s;
}

export function decodeU128sFromSimulationResult(
  simulationResult: AlkanesSimulationResult
): BoxedResponse<bigint[], AlkanesSimulationError> {
  const leBytes = simulationResult.parsed?.le;
  if (!leBytes) {
    return new BoxedError(
      AlkanesSimulationError.UnknownError,
      "Simulation result does not contain 'le' field"
    );
  }

  return new BoxedSuccess(decodeU128sFromLeHexString(leBytes));
}
