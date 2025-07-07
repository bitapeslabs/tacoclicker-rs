import { IAccount } from "./account/types";
import { Signer } from "./signer";
import { OylProvider } from "./provider";
import * as bitcoin from "bitcoinjs-lib";
import { AlkanesPayload } from "./shared/types";
import { timeout, tweakSigner } from "./shared/utils";
import {
  createDeployCommitPsbt,
  createDeployRevealPsbt,
  deployCommit,
} from "./base";
import { getEstimatedFee } from "./psbt";
import { FormattedUtxo } from "./utxo";
import { DEFAULT_FEE_RATE } from "./shared/constants";

export const contractDeployment = async ({
  payload,
  utxos,
  account,
  protostone,
  provider,
  feeRate,
  signer,
}: {
  payload: AlkanesPayload;
  utxos: FormattedUtxo[];
  account: IAccount;
  protostone: Buffer;
  provider: OylProvider;
  feeRate?: number;
  signer: Signer;
}) => {
  const { script, txId } = await deployCommit({
    payload,
    utxos,
    account,
    provider,
    feeRate,
    signer,
  });

  await timeout(3000);

  const reveal = await deployReveal({
    commitTxId: txId,
    script,
    protostone,
    account,
    provider,
    feeRate,
    signer,
  });

  return { ...reveal, commitTx: txId };
};

export const actualDeployRevealFee = async ({
  protostone,
  tweakedPublicKey,
  commitTxId,
  receiverAddress,
  script,
  provider,
  feeRate,
}: {
  protostone: Buffer;
  tweakedPublicKey: string;
  commitTxId: string;
  receiverAddress: string;
  script: Buffer;
  provider: OylProvider;
  feeRate?: number;
}) => {
  if (!feeRate) {
    feeRate = (await provider.esplora.getFeeEstimates())["1"] as number;
  }

  const { psbt } = await createDeployRevealPsbt({
    protostone,
    commitTxId,
    receiverAddress,
    script,
    tweakedPublicKey,
    provider,
    feeRate,
  });

  const { fee: estimatedFee } = await getEstimatedFee({
    feeRate,
    psbt,
    provider,
  });

  const { psbt: finalPsbt } = await createDeployRevealPsbt({
    protostone,
    commitTxId,
    receiverAddress,
    script,
    tweakedPublicKey,
    provider,
    feeRate,
    fee: estimatedFee,
  });

  const { fee: finalFee, vsize } = await getEstimatedFee({
    feeRate,
    psbt: finalPsbt,
    provider,
  });

  return { fee: finalFee, vsize };
};

export const deployReveal = async ({
  protostone,
  commitTxId,
  script,
  account,
  provider,
  feeRate,
  signer,
}: {
  protostone: Buffer;
  commitTxId: string;
  script: string;
  account: IAccount;
  provider: OylProvider;
  feeRate?: number;
  signer: Signer;
}) => {
  if (!signer.taprootKeyPair) {
    throw new Error("Signer does not have a taproot key pair");
  }

  const tweakedTaprootKeyPair: bitcoin.Signer = tweakSigner(
    signer.taprootKeyPair,
    {
      network: provider.network,
    }
  );

  const tweakedPublicKey = tweakedTaprootKeyPair.publicKey.toString("hex");

  const { fee } = await actualDeployRevealFee({
    protostone,
    tweakedPublicKey,
    receiverAddress: account.taproot.address,
    commitTxId,
    script: Buffer.from(script, "hex"),
    provider,
    feeRate: feeRate ?? DEFAULT_FEE_RATE,
  });

  const { psbt: finalRevealPsbt } = await createDeployRevealPsbt({
    protostone,
    tweakedPublicKey,
    receiverAddress: account.taproot.address,
    commitTxId,
    script: Buffer.from(script, "hex"),
    provider,
    feeRate: feeRate ?? DEFAULT_FEE_RATE,
    fee,
  });

  let finalReveal = bitcoin.Psbt.fromBase64(finalRevealPsbt, {
    network: provider.network,
  });

  finalReveal.signInput(0, tweakedTaprootKeyPair);
  finalReveal.finalizeInput(0);

  const finalSignedPsbt = finalReveal.toBase64();

  const revealResult = await provider.pushPsbt({
    psbtBase64: finalSignedPsbt,
  });

  return revealResult;
};
