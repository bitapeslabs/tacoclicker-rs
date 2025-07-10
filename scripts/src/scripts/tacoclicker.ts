import path from "path";
import { deployContract } from "@/libs/utils";
import { AlkaneId } from "tacoclicker-sdk";
import { TaqueriaContract } from "@/contracts/taqueria";
import { provider } from "@/consts";
import { walletSigner } from "@/crypto/wallet";
import { taskLogger as logger } from "@/consts";
import { consumeOrThrow } from "@/boxed";

const readableAlkaneId = (id: AlkaneId) =>
  `(block→${Number(id.block)}n : tx→${Number(id.tx)}n)`;

export const runTacoClicker = async (): Promise<boolean> => {
  const root = logger.start("deploy & inspect taco clicker contracts");

  try {
    const freeMintId = await deployContract(
      path.join(__dirname, "../..", "./contracts/taqueria-factory"),
      [100n] // view-method quirk
    );
    logger.success(`contract at ${readableAlkaneId(freeMintId)}`);

    const tokenContract = new TaqueriaContract(
      provider,
      freeMintId,
      walletSigner.signPsbt
    );

    let echoResponse = consumeOrThrow(
      await logger.progressAbstract(
        "viewEcho",
        tokenContract.viewEcho([1n, 2n, 3n, 102123n])
      )
    );

    logger.success("Contract response: " + echoResponse);

    root.close();
    return true;
  } catch (err) {
    logger.error(err as Error);
    root.close();
    process.exit(1);
  }
};
