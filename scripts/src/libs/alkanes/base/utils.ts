import { IAccount } from "../account/types";
import { IOylProvider } from "../provider/types";
import * as bitcoin from "bitcoinjs-lib";
import { FormattedUtxo } from "../utxo/types";
import { getAddressType } from "../account/utils";
import { toXOnly } from "bitcoinjs-lib/src/psbt/bip371";
export const formatInputsToSign = async ({
  _psbt,
  senderPublicKey,
  network,
}: {
  _psbt: bitcoin.Psbt;
  senderPublicKey: string;
  network: bitcoin.Network;
}) => {
  let index = 0;
  for await (const v of _psbt.data.inputs) {
    const isSigned = v.finalScriptSig || v.finalScriptWitness;
    const lostInternalPubkey = !v.tapInternalKey;
    if (!isSigned || lostInternalPubkey) {
      const tapInternalKey = toXOnly(Buffer.from(senderPublicKey, "hex"));
      const p2tr = bitcoin.payments.p2tr({
        internalPubkey: tapInternalKey,
        network: network,
      });
      if (
        v.witnessUtxo?.script.toString("hex") === p2tr.output?.toString("hex")
      ) {
        v.tapInternalKey = tapInternalKey;
      }
    }
    index++;
  }

  return _psbt;
};

export async function addInputForUtxo(
  psbt: bitcoin.Psbt,
  utxo: FormattedUtxo,
  account: IAccount,
  provider: IOylProvider
) {
  const type = getAddressType(utxo.address);
  switch (type) {
    case 0: {
      // legacy P2PKH
      const prevHex = await provider.esplora.getTxHex(utxo.txId);
      psbt.addInput({
        hash: utxo.txId,
        index: +utxo.outputIndex,
        nonWitnessUtxo: Buffer.from(prevHex, "hex"),
      });
      break;
    }
    case 2: {
      // nested SegWit
      const redeem = bitcoin.script.compile([
        bitcoin.opcodes.OP_0,
        bitcoin.crypto.hash160(Buffer.from(account.nestedSegwit.pubkey, "hex")),
      ]);
      psbt.addInput({
        hash: utxo.txId,
        index: +utxo.outputIndex,
        redeemScript: redeem,
        witnessUtxo: {
          value: utxo.satoshis,
          script: bitcoin.script.compile([
            bitcoin.opcodes.OP_HASH160,
            bitcoin.crypto.hash160(redeem),
            bitcoin.opcodes.OP_EQUAL,
          ]),
        },
      });
      break;
    }
    case 1: // native P2WPKH
    case 3: // P2TR
    default: {
      psbt.addInput({
        hash: utxo.txId,
        index: +utxo.outputIndex,
        witnessUtxo: {
          value: utxo.satoshis,
          script: Buffer.from(utxo.scriptPk, "hex"),
        },
      });
    }
  }
}
export const toTxId = (rawLeTxid: string) =>
  Buffer.from(rawLeTxid, "hex").reverse().toString("hex");
