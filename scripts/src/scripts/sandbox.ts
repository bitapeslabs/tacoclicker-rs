import path from "path";
import { deployContract } from "@/libs/utils";
import { AlkaneId } from "tacoclicker-sdk";
import { SandboxContract } from "@/contracts/sandbox";
import { provider } from "@/consts";
import { walletSigner } from "@/crypto/wallet";
import { taskLogger as logger } from "@/consts";
import { consumeOrThrow } from "@/boxed";

const readableAlkaneId = (id: AlkaneId) => `(block→${Number(id.block)}n : tx→${Number(id.tx)}n)`;

export const runSandbox = async (): Promise<boolean> => {
  const root = logger.start("deploy & inspect sandbox contract");

  try {
    const freeMintId = await deployContract(
      path.join(__dirname, "../..", "./contracts/sandbox"),
      [100n] // view-method quirk
    );
    logger.success(`contract at ${readableAlkaneId(freeMintId)}`);

    const sandboxContract = new SandboxContract(provider, freeMintId, walletSigner.signPsbt);

    let countResponse = consumeOrThrow(
      await logger.progressExecute(
        "getWordCount",
        sandboxContract.wordCount(
          walletSigner.address,
          { data: "I have four words" },
          {
            inscribe:
              "I have a lot more than four words if you count all of these and I can do that because I am in an inscription and arent bound by the limits of opreturn anymore so that makes me happy",
          }
        )
      )
    ).decodeTo("object");

    logger.info("Asserting contract state...");
    logger.deepAssert(
      {
        calldata_echo: "I have four words",
        inscribe_echo:
          "I have a lot more than four words if you count all of these and I can do that because I am in an inscription and arent bound by the limits of opreturn anymore so that makes me happy",
        calldata_count: 4,
        inscribe_count: 39,
      },
      countResponse
    );

    root.close();
    return true;
  } catch (err) {
    logger.error(err as Error);
    root.close();
    process.exit(1);
  }
};
