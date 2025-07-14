import { taskLogger as logger, provider } from "@/consts";
import { walletSigner } from "@/crypto/wallet";
import { TokenContract } from "tacoclicker-sdk";

export const runGeneralTest = async (): Promise<boolean> => {
  const root = logger.start("Running general test");
  const contract = new TokenContract(
    provider,
    {
      block: 2n,
      tx: 102n,
    },
    walletSigner.signPsbt
  );

  try {
    const test = await contract.echo("Hello, TacoClicker!");

    return true;
  } catch (error) {
    console.error(error);
    logger.error(error as Error);
    root.close();
    process.exit(1);
  }
};
