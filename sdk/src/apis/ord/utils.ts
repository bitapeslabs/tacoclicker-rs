import * as CBOR from "cbor-x";
import { DecodedCBOR } from "./types";

export function decodeCBOR(hex: string): DecodedCBOR {
  const buffer = Buffer.from(hex, "hex");
  return CBOR.decode(buffer);
}
