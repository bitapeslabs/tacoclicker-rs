import path from "path";
import { deployContract } from "@/libs/utils";
import { AlkaneId } from "tacoclicker-sdk";
import { SandboxContract } from "@/contracts/sandbox";
import { provider } from "@/consts";
import { walletSigner } from "@/crypto/wallet";
import { taskLogger as logger } from "@/consts";
import { consumeOrThrow } from "@/boxed";

const readableAlkaneId = (id: AlkaneId) =>
  `(block→${Number(id.block)}n : tx→${Number(id.tx)}n)`;

export const runSandbox = async (): Promise<boolean> => {
  const root = logger.start("deploy & inspect sandbox contract");

  try {
    const freeMintId = await deployContract(
      path.join(__dirname, "../..", "./contracts/sandbox"),
      [100n] // view-method quirk
    );
    logger.success(`contract at ${readableAlkaneId(freeMintId)}`);

    const tokenContract = new SandboxContract(
      provider,
      freeMintId,
      walletSigner.signPsbt
    );

    let countResponse = consumeOrThrow(
      await logger.progressAbstract(
        "getWordCount",
        tokenContract.viewWordCount("I have four words")
      )
    );

    logger.deepAssert(4, countResponse.count);

    root.close();
    return true;
  } catch (err) {
    logger.error(err as Error);
    root.close();
    process.exit(1);
  }
};
