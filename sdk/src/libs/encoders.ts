export function encodeStringToU128Array(str: string): bigint[] {
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
