import { IEsploraTransaction } from "tacoclicker-sdk";
import { Transaction as BitcoinJsTransaction } from "bitcoinjs-lib";

/**
 */
export function satsToBTC(sats: number): number {
  if (!Number.isFinite(sats)) throw new Error("Invalid satoshi input");
  return sats / 100_000_000;
}

export function btcToSats(btc: number): number {
  if (!Number.isFinite(btc)) throw new Error("Invalid BTC input");

  // Convert to string, split at decimal
  const [intPart, decimalPart = ""] = btc.toString().split(".");

  // Pad decimal to 8 digits (sats)
  const decimalPadded = (decimalPart + "00000000").slice(0, 8);

  const satsStr = intPart + decimalPadded;
  const sats = BigInt(satsStr);

  if (sats > Number.MAX_SAFE_INTEGER) {
    throw new Error("Resulting satoshi value exceeds JS safe integer range");
  }

  return Number(sats);
}

export const getEsploraTransactionWithHex = (
  tx: IEsploraTransaction
): IEsploraTransaction & { hex: string } => {
  const transaction = new BitcoinJsTransaction();

  transaction.version = tx.version;
  transaction.locktime = tx.locktime;

  tx.vin.forEach((input) => {
    if (input.is_coinbase) {
      // Coinbase transactions dont have txid
      transaction.addInput(
        Buffer.alloc(32),
        0xffffffff,
        input.sequence,
        Buffer.from(input.scriptsig, "hex")
      );
      return;
    }

    const txidBuffer = Buffer.from(input.txid, "hex").reverse();
    const scriptSigBuffer = Buffer.from(input.scriptsig, "hex");

    const vinIndex = transaction.addInput(
      txidBuffer,
      input.vout,
      input.sequence,
      Buffer.from(input.scriptsig, "hex")
    );

    transaction.ins[vinIndex].script = scriptSigBuffer;
  });

  tx.vout.forEach((output) => {
    const scriptPubKeyBuffer = Buffer.from(output.scriptpubkey, "hex");
    transaction.addOutput(scriptPubKeyBuffer, output.value);
  });

  return {
    ...tx,
    hex: transaction.toHex(),
  };
};
