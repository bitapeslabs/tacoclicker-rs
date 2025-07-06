function decodeToString(bytes: Uint8Array): string {
  // Reverse the byte order (LE → BE for decoding)
  const reversed = new Uint8Array(bytes).reverse();

  // Decode as UTF-8
  return new TextDecoder().decode(reversed);
}
