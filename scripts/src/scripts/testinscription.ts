import { Psbt } from "bitcoinjs-lib";
import { BorshSchema } from "borsher";
import { taskLogger as logger } from "@/consts";
import { provider } from "@/consts";
import { walletSigner } from "@/crypto/wallet";
import {
  AlkanesInscription,
  ProtostoneTransactionWithInscription,
} from "tacoclicker-sdk";
import { consumeOrThrow } from "@/boxed";
import { sleep } from "@/libs/alkanes/shared/baseutils";

const CHANGE_ADDRESS = walletSigner.address;
const INSCRIPTION_PAYLOAD = { message: "i like turtles" };
const INSCRIPTION_SCHEMA = BorshSchema.Struct({
  message: BorshSchema.String,
});

async function broadcastRawTransaction(txHex: string): Promise<string> {
  const response = consumeOrThrow(
    await provider.rpc.electrum.esplora_broadcastTx(txHex)
  );
  logger.info(
    `Broadcasted transaction: ${provider.explorerUrl}/tx/${response}`
  );
  return response;
}

export const runCommitRevealInscriptionTest = async (): Promise<boolean> => {
  const root = logger.start("commit-reveal inscription flow");

  try {
    const inscription = new AlkanesInscription(
      INSCRIPTION_PAYLOAD,
      INSCRIPTION_SCHEMA
    );

    const wrapper = new ProtostoneTransactionWithInscription(
      CHANGE_ADDRESS,
      inscription,
      {
        provider,
        transfers: [], // no BTC transfers in this smoke test
      }
    );

    /* 2️⃣  COMMIT PHASE */
    logger.info("Building commit PSBT…");

    let spinner = logger.progress("Creating commit and reveal txs…");
    const commitPsbt = await wrapper.buildCommit();
    const signedTx = await walletSigner.signPsbt(commitPsbt.toBase64());

    wrapper.finalizeCommit(signedTx);

    const revealPsbt = await wrapper.buildReveal();

    const revealSignedTx = await walletSigner.signPsbt(revealPsbt.toBase64());

    spinner.succeed("Done. Submitting transactions…");

    spinner = logger.progress(
      "Broadcasting and waiting for commit transaction…"
    );
    await provider.waitForConfirmation(await broadcastRawTransaction(signedTx));

    await sleep(5000);

    spinner.succeed("Commit transaction confirmed.");

    spinner = logger.progress(
      "Broadcasting and waiting for reveal transaction…"
    );
    await provider.waitForConfirmation(
      await broadcastRawTransaction(revealSignedTx)
    );

    spinner.succeed("Reveal transaction confirmed.");

    logger.success("Inscription commit-reveal flow completed successfully.");

    /* 5️⃣  Done */
    root.close();
    return true;
  } catch (error) {
    console.error(error);
    logger.error(error as Error);
    root.close();
    process.exit(1);
  }
};
