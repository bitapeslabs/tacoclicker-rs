import { AddressType, AlkanesUtxo } from "./types";
import { addressFormats } from "@sadoprotocol/ordit-sdk";
import * as bitcoin from "bitcoinjs-lib";
import { FormattedUtxo } from "@/apis/sandshrew";
import { Provider } from "@/provider";
import * as varuint from "varuint-bitcoin";
import {
  AlkanesByAddressOutpoint,
  AlkanesOutpoint,
  IEsploraPrevout,
  IEsploraTransaction,
  IEsploraTransactionStatus,
  IEsploraVin,
  IEsploraVout,
} from "@/apis";
import { ecc } from "@/crypto/ecc";
import ECPairFactory from "ecpair";

export const EcPair = ECPairFactory(ecc);
type BasePsbtParams = {
  feeRate?: number;
  fee?: number;
};

export function getAddressType(address: string): AddressType | null {
  if (
    addressFormats.mainnet.p2pkh.test(address) ||
    addressFormats.testnet.p2pkh.test(address) ||
    addressFormats.regtest.p2pkh.test(address)
  ) {
    return AddressType.P2PKH;
  } else if (
    addressFormats.mainnet.p2tr.test(address) ||
    addressFormats.testnet.p2tr.test(address) ||
    addressFormats.regtest.p2tr.test(address)
  ) {
    return AddressType.P2TR;
  } else if (
    addressFormats.mainnet.p2sh.test(address) ||
    addressFormats.testnet.p2sh.test(address) ||
    addressFormats.regtest.p2sh.test(address)
  ) {
    return AddressType.P2SH_P2WPKH;
  } else if (
    addressFormats.mainnet.p2wpkh.test(address) ||
    addressFormats.testnet.p2wpkh.test(address) ||
    addressFormats.regtest.p2wpkh.test(address)
  ) {
    return AddressType.P2WPKH;
  } else {
    return null;
  }
}

export function redeemTypeFromOutput(
  script: Buffer,
  network: bitcoin.Network
): AddressType | null {
  /* fast-path 1: v0 P2WPKH  => 0x00 0x14 <20-byte-hash> */
  if (script.length === 22 && script[0] === 0x00 && script[1] === 0x14)
    return AddressType.P2WPKH;

  /* fast-path 2: v1 P2TR    => 0x51 0x20 <32-byte-xonly-key> */
  if (script.length === 34 && script[0] === 0x51 && script[1] === 0x20)
    return AddressType.P2TR;

  /* generic path: convert script → address → enum */
  try {
    return null;
  } catch {
    throw new Error("Unknown or unsupported output script");
  }
}

export function addInputDynamic(
  psbt: bitcoin.Psbt,
  network: bitcoin.Network,
  utxo: FormattedUtxo
) {
  const prevTx = utxo.prevTx;
  const prevOut = prevTx.vout[utxo.outputIndex];
  const scriptBuf = Buffer.from(prevOut.scriptpubkey, "hex");
  const addrType = getAddressType(prevOut.scriptpubkey_address); // <- now enum

  switch (addrType) {
    case AddressType.P2WPKH: {
      psbt.addInput({
        hash: utxo.txId,
        index: utxo.outputIndex,
        witnessUtxo: {
          script: scriptBuf,
          value: prevOut.value,
        },
      });
      break;
    }

    case AddressType.P2PKH: {
      psbt.addInput({
        hash: utxo.txId,
        index: utxo.outputIndex,
        nonWitnessUtxo: Buffer.from(utxo.prevTxHex, "hex"),
      });
      break;
    }

    case AddressType.P2SH_P2WPKH: {
      const redeem = bitcoin.payments.p2sh({ output: scriptBuf, network });

      if (
        redeem.redeem &&
        redeemTypeFromOutput(redeem.redeem.output!, network) ===
          AddressType.P2WPKH
      ) {
        psbt.addInput({
          hash: utxo.txId,
          index: utxo.outputIndex,
          witnessUtxo: {
            script: redeem.output!,
            value: prevOut.value,
          },
          redeemScript: redeem.redeem.output!,
        });
      } else {
        throw new Error("Unsupported P2SH script (expected P2WPKH-nested)");
      }
      break;
    }

    case AddressType.P2TR: {
      psbt.addInput({
        hash: utxo.txId,
        index: utxo.outputIndex,
        witnessUtxo: {
          script: scriptBuf,
          value: prevOut.value,
        },
        tapInternalKey: scriptBuf.subarray(2, 34),
      });
      break;
    }

    default:
      const key = String(addrType);
      throw new Error(`Unsupported script type: ${key}`);
  }
}

export const psbtBuilder = async <T extends BasePsbtParams>(
  provider: Provider,
  psbtBuilder: (params: T) => Promise<{ psbtBase64: string; fee?: number }>,
  params: T
): Promise<{ psbtBase64: string; fee: number; vsize: number }> => {
  const { psbtBase64 } = await psbtBuilder(params);

  const { fee: actualFee } = await getEstimatedFee({
    provider,
    feeRate: params.feeRate ?? provider.defaultFeeRate,
    psbtBase64,
  });

  const { psbtBase64: finalPsbt } = await psbtBuilder({
    ...params,
    fee: actualFee,
  });

  const { fee: finalFee, vsize } = await getEstimatedFee({
    provider,
    feeRate: params.feeRate ?? provider.defaultFeeRate,
    psbtBase64: finalPsbt,
  });

  return { psbtBase64: finalPsbt, fee: finalFee, vsize };
};

const detectInputType = (input: any) => {
  if (input.tapInternalKey || input.tapKeySig || input.tapLeafScript) {
    return "p2tr";
  }

  if (input.witnessUtxo?.script) {
    const scriptLen = input.witnessUtxo.script.length;
    if (scriptLen === 34) return "p2tr";
    if (scriptLen === 22) return "p2wpkh";
    if (scriptLen === 23) return "p2sh";
    if (scriptLen === 25) return "p2pkh";
  }

  if (input.redeemScript) return "p2sh";
  if (input.witnessScript) return "p2wpkh";

  return "p2tr";
};

const getTaprootWitnessSize = (input: any) => {
  // Base taproot witness size (signature)
  let witnessSize = 16.25; // 65 bytes / 4 (witness discount)

  // If there's a reveal script
  if (input.tapLeafScript && input.tapLeafScript.length > 0) {
    const leafScript = input.tapLeafScript[0];
    // Add control block size (33 bytes + path length) / 4
    witnessSize += (33 + (leafScript.controlBlock.length - 33)) / 4;
    // Add script size / 4
    witnessSize += leafScript.script.length / 4;
    // Add any witness stack items / 4
    if (input.witnessStack) {
      witnessSize +=
        input.witnessStack.reduce(
          (sum: number, item: unknown[]) => sum + item.length,
          0
        ) / 4;
    }
  }

  return witnessSize;
};

const SIZES = {
  p2tr: {
    input: {
      unsigned: 41,
      witness: 16.25, // Fallback
      getWitnessSize: getTaprootWitnessSize,
    },
    output: 43,
  },
  p2wpkh: {
    input: {
      unsigned: 41,
      witness: 26.5,
      getWitnessSize: (input: unknown) => 26.5, // Fixed witness size
    },
    output: 31,
  },
  p2sh: {
    input: {
      unsigned: 63,
      witness: 27.75,
      getWitnessSize: (input: unknown) => 27.75, // Fixed witness size
    },
    output: 32,
  },
  p2pkh: {
    input: {
      unsigned: 148,
      witness: 0,
      getWitnessSize: (input: unknown) => 0, // No witness data
    },
    output: 34,
  },
  // OP_RETURN
  nulldata: {
    output: 9, // Base size
  },
};
function classifyScript(script: Buffer): string {
  // easy segwit matches by length/header
  if (script.length === 22 && script[0] === 0x00 && script[1] === 0x14)
    return "v0_p2wpkh";
  if (script.length === 34 && script[0] === 0x00 && script[1] === 0x20)
    return "v0_p2wsh";
  if (script.length === 34 && script[0] === 0x51 && script[1] === 0x20)
    return "v1_p2tr";

  // decompile legacy patterns
  const chunks = bitcoin.script.decompile(script);
  if (!chunks) return "nonstandard";

  const [op0, op1, data, op3, op4] = chunks;

  if (
    chunks.length === 5 &&
    op0 === bitcoin.opcodes.OP_DUP &&
    op1 === bitcoin.opcodes.OP_HASH160 &&
    Buffer.isBuffer(data) &&
    data.length === 20 &&
    op3 === bitcoin.opcodes.OP_EQUALVERIFY &&
    op4 === bitcoin.opcodes.OP_CHECKSIG
  )
    return "p2pkh";

  if (
    chunks.length === 3 &&
    op0 === bitcoin.opcodes.OP_HASH160 &&
    Buffer.isBuffer(chunks[1]) &&
    (chunks[1] as Buffer).length === 20 &&
    op3 === bitcoin.opcodes.OP_EQUAL
  )
    return "p2sh";

  return "nonstandard";
}
export const getEstimatedFee = async ({
  provider,
  feeRate,
  psbtBase64,
}: {
  provider: Provider;
  feeRate: number;
  psbtBase64: string;
}) => {
  const psbtObj = bitcoin.Psbt.fromBase64(psbtBase64, {
    network: provider.network,
  });

  // Base overhead
  const BASE_OVERHEAD = 8; // Version (4) + Locktime (4)
  const SEGWIT_OVERHEAD = 1;

  // VarInt sizes depend on number of inputs/outputs
  const getVarIntSize = (n: number) => {
    if (n < 0xfd) return 1;
    if (n < 0xffff) return 3;
    if (n < 0xffffffff) return 5;
    return 9;
  };

  // Calculate input sizes
  const inputSizes = psbtObj.data.inputs.map((input) => {
    const type = detectInputType(input);
    const size =
      SIZES[type].input.unsigned + SIZES[type].input.getWitnessSize(input);
    return size;
  });

  // Calculate output sizes
  const outputSizes = psbtObj.txOutputs.map((output) => {
    // Check if OP_RETURN output
    if (output.script[0] === 0x6a) {
      return output.script.length + SIZES.nulldata.output;
    }

    const scriptType =
      output.script.length === 34
        ? "p2tr"
        : output.script.length === 22
          ? "p2wpkh"
          : output.script.length === 23
            ? "p2sh"
            : "p2pkh";

    return SIZES[scriptType].output;
  });

  const totalInputSize = inputSizes.reduce((sum, size) => sum + size, 0);
  const totalOutputSize = outputSizes.reduce((sum, size) => sum + size, 0);

  const inputVarIntSize = getVarIntSize(inputSizes.length);
  const outputVarIntSize = getVarIntSize(outputSizes.length);

  const vsize = Math.round(
    BASE_OVERHEAD +
      SEGWIT_OVERHEAD +
      inputVarIntSize +
      outputVarIntSize +
      totalInputSize +
      totalOutputSize
  );

  const fee = Math.ceil(vsize * feeRate);

  return {
    fee,
    vsize,
  };
};

export function calculateTaprootTxSize(
  taprootInputCount: number,
  nonTaprootInputCount: number,
  outputCount: number
): number {
  const baseTxSize = 10; // Base transaction size without inputs/outputs

  // Size contributions from inputs
  const taprootInputSize = 64; // Average size of a Taproot input (can vary)
  const nonTaprootInputSize = 42; // Average size of a non-Taproot input (can vary)

  const outputSize = 40;

  const totalInputSize =
    taprootInputCount * taprootInputSize +
    nonTaprootInputCount * nonTaprootInputSize;
  const totalOutputSize = outputCount * outputSize;

  return baseTxSize + totalInputSize + totalOutputSize;
}

export const minimumFee = ({
  taprootInputCount,
  nonTaprootInputCount,
  outputCount,
}: {
  taprootInputCount: number;
  nonTaprootInputCount: number;
  outputCount: number;
}) => {
  return calculateTaprootTxSize(
    taprootInputCount,
    nonTaprootInputCount,
    outputCount
  );
};
export function trimUndefined<T extends object>(obj: T): T {
  const result = {} as T;

  for (const key in obj) {
    const value = obj[key];
    if (value !== undefined) {
      result[key] = value;
    }
  }

  return result;
}
const DUMMY_SIG_73 = Buffer.alloc(73, 0);
const DUMMY_PUB_33 = Buffer.alloc(33, 0);

export function extractWithDummySigs(psbt: bitcoin.Psbt): bitcoin.Transaction {
  const clone = psbt.clone();

  clone.data.inputs.forEach((input, idx) => {
    if (input.finalScriptSig || input.finalScriptWitness) return;

    if (input.witnessUtxo) {
      const witness = Buffer.concat([
        Buffer.from("02", "hex"),
        Buffer.from("49", "hex"),
        DUMMY_SIG_73,
        Buffer.from("21", "hex"),
        DUMMY_PUB_33,
      ]);
      clone.updateInput(idx, { finalScriptWitness: witness });
    } else {
      const script = Buffer.concat([
        Buffer.from("48", "hex"),
        DUMMY_SIG_73,
        Buffer.from("21", "hex"),
        DUMMY_PUB_33,
      ]);
      clone.updateInput(idx, { finalScriptSig: script });
    }
  });

  return clone.extractTransaction();
}

export function toEsploraTx(
  tx: bitcoin.Transaction,
  status: IEsploraTransactionStatus = { confirmed: false },
  network: bitcoin.Network = bitcoin.networks.bitcoin
): IEsploraTransaction {
  /* ──────────────  VOUT  ────────────── */
  const vout: IEsploraVout[] = tx.outs.map((out) => {
    const scriptBuf = out.script;
    const scriptHex = scriptBuf.toString("hex");
    const scriptAsm = bitcoin.script.toASM(scriptBuf);

    /* classify → “wpkh”, “wsh”, “pkh”, “sh”, “tr”, … */
    const short = classifyScript(scriptBuf);
    const scriptpubkey_type =
      short === "wpkh"
        ? "v0_p2wpkh"
        : short === "wsh"
          ? "v0_p2wsh"
          : short === "tr"
            ? "v1_p2tr"
            : short === "pkh"
              ? "p2pkh"
              : short === "sh"
                ? "p2sh"
                : "nonstandard";

    /* best-effort address decode */
    let address = "";
    try {
      address = bitcoin.address.fromOutputScript(scriptBuf, network);
    } catch {
      /* nonstandard / anyone-can-spend */
    }

    return {
      scriptpubkey: scriptHex,
      scriptpubkey_asm: scriptAsm,
      scriptpubkey_type,
      scriptpubkey_address: address,
      value: out.value,
    };
  });

  /* ──────────────  VIN  ────────────── */
  const vin: IEsploraVin[] = tx.ins.map((input) => ({
    txid: Buffer.from(input.hash).reverse().toString("hex"),
    vout: input.index,
    prevout: undefined, // fill later if you have it
    scriptsig: input.script.toString("hex"),
    scriptsig_asm: bitcoin.script.toASM(input.script),
    witness: input.witness.map((w) => w.toString("hex")),
    is_coinbase: tx.isCoinbase(),
    sequence: input.sequence,
  }));

  /* ──────────  FEE, SIZE, WEIGHT  ────────── */
  const outputValueSum = vout.reduce((sum, o) => sum + o.value, 0);

  /* Only compute fee if every vin.prevout has a value ≥ 0 */
  const allPrevoutValuesKnown = vin.every(
    (v) => v.prevout && typeof v.prevout.value === "number"
  );

  const inputValueSum = allPrevoutValuesKnown
    ? vin.reduce((sum, v) => sum + (v.prevout!.value as number), 0)
    : 0;

  const fee =
    allPrevoutValuesKnown && !tx.isCoinbase()
      ? inputValueSum - outputValueSum
      : 0;

  const size = tx.byteLength();
  const weight = tx.weight();

  return {
    txid: tx.getId(),
    version: tx.version,
    locktime: tx.locktime,
    vin,
    vout,
    size,
    weight,
    fee,
    status,
  };
}
export function witnessStackToScriptWitness(stack: Buffer[]): Buffer {
  const parts: Buffer[] = [];

  // stack item count (var-int)
  parts.push(varuint.encode(stack.length));

  // each item: <len><bytes>
  for (const item of stack) {
    parts.push(varuint.encode(item.length));
    parts.push(item);
  }
  return Buffer.concat(parts);
}
export function tapTweakHash(pubKey: Buffer, h: Buffer | undefined): Buffer {
  return bitcoin.crypto.taggedHash(
    "TapTweak",
    Buffer.concat(h ? [pubKey, h] : [pubKey])
  );
}

export const assertHex = (pubKey: Buffer) =>
  pubKey.length === 32 ? pubKey : pubKey.slice(1, 33);

export function tweakSigner(
  signer: bitcoin.Signer,
  opts: any = {}
): bitcoin.Signer {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  let privateKey: Uint8Array | undefined = signer.privateKey!;
  if (!privateKey) {
    throw new Error("Private key required");
  }
  if (signer.publicKey[0] === 3) {
    privateKey = ecc.privateNegate(privateKey);
  }

  const tweakedPrivateKey = ecc.privateAdd(
    privateKey,
    tapTweakHash(assertHex(signer.publicKey), opts.tweakHash)
  );
  if (!tweakedPrivateKey) {
    throw new Error("Invalid tweaked private key!");
  }

  return EcPair.fromPrivateKey(Buffer.from(tweakedPrivateKey), {
    network: opts.network,
  });
}
