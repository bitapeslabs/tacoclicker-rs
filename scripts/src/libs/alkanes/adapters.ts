import fs from "fs/promises";
import path from "path";
import { promisify } from "util";
import { gzip as _gzip } from "zlib";
import { AlkanesPayload } from "./shared/types";
import { encodeRunestoneProtostone, ProtoStone, encipher } from "alkanes";

export interface AlkanesDeploymentParams {
  contract: Uint8Array;
  payload: AlkanesPayload;
  protostone: Uint8Array;
  callData: bigint[];
}

const gzip = promisify(_gzip);

export async function getAlkanesDeploymentParamsFromWasmPath(
  wasmPath: string,
  callData: bigint[]
): Promise<AlkanesDeploymentParams> {
  const contract = new Uint8Array(
    await fs.readFile(path.resolve(process.cwd(), wasmPath))
  );
  const payload: AlkanesPayload = {
    body: await gzip(contract, { level: 9 }),
    cursed: false,
    tags: { contentType: "" }, // set if you want MIME-style tagging
  };

  const protostone = encodeRunestoneProtostone({
    protostones: [
      ProtoStone.message({
        protocolTag: 1n,
        edicts: [],
        pointer: 0,
        refundPointer: 0,
        calldata: encipher(callData),
      }),
    ],
  }).encodedRunestone;

  return { contract, payload, protostone, callData };
}
