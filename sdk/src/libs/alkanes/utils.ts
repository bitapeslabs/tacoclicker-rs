import { AddressType } from "./types";
import { addressFormats } from "@sadoprotocol/ordit-sdk";
import * as bitcoin from "bitcoinjs-lib";
import { FormattedUtxo } from "@/apis/sandshrew";
import { Provider } from "@/provider";
import * as z from "zod";

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

export const bigintReviver = (_: string, value: any) =>
  typeof value === "string" && /^-?\d+n$/.test(value.trim())
    ? BigInt(value.slice(0, -1)) // drop the trailing "n"
    : value;

export const stringifyBigInts = (val: any): any => {
  if (typeof val === "bigint") return val.toString(); // 123n  -> "123"
  if (Array.isArray(val)) return val.map(stringifyBigInts);
  if (val && typeof val === "object") {
    return Object.fromEntries(
      Object.entries(val).map(([k, v]) => [k, stringifyBigInts(v)])
    );
  }
  return val;
};

export const maybeBig = z.union([z.string(), z.number(), z.bigint()]);
export const simulateRequestSchema = z
  .object({
    alkanes: z.array(z.any()).optional(),
    transaction: z.string().optional(),
    block: z.string().optional(),
    height: maybeBig.optional(),
    txindex: maybeBig.optional(),
    inputs: z.array(maybeBig).optional(),
    pointer: maybeBig.optional(),
    refundPointer: maybeBig.optional(),
    vout: maybeBig.optional(),
    target: z
      .object({
        block: maybeBig.optional(),
        tx: maybeBig.optional(),
      })
      .optional(),
  })
  .partial();
