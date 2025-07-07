import { deploy } from "@/scripts";
import { provider } from "./consts";
import { BoxedResponse, consumeOrThrow } from "./boxed";
import { AlkaneId, BaseTokenContract } from "tacoclicker-sdk";
import chalk from "chalk";
import { walletSigner } from "./crypto/wallet";

const start = async () => {
  try {
    const alkaneId: AlkaneId = {
      block: 2n,
      tx: 26n,
    };

    let tokenContract = new BaseTokenContract(
      provider,
      alkaneId,
      walletSigner.signPsbt
    );

    let [name, symbol, totalSupply, valuePerMint, minted, cap] =
      await Promise.all([
        tokenContract.viewGetName(),
        tokenContract.viewGetSymbol(),
        tokenContract.viewGetTotalSupply(),
        tokenContract.viewGetValuePerMint(),
        tokenContract.viewGetMinted(),
        tokenContract.viewGetCap(),
      ]);

    console.log(chalk.cyan("name: " + consumeOrThrow(name)));
    console.log(chalk.cyan("symbol: " + consumeOrThrow(symbol)));
    console.log(chalk.cyan("total supply: " + consumeOrThrow(totalSupply)));
    console.log(chalk.cyan("per mint: " + consumeOrThrow(valuePerMint)));
    console.log(chalk.cyan("minted: " + consumeOrThrow(minted) + " tokens"));
    console.log(chalk.cyan("cap: " + consumeOrThrow(cap)));
  } catch (error) {
    console.log(
      chalk.red("❌ Error during simulation: " + (error as Error).message)
    );
  }
};
process.removeAllListeners("warning");
process.on("warning", (w) => {
  if (w.name === "DeprecationWarning") return;
  process.emit("warning", w);
});

start();
