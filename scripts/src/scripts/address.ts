import { provider } from "@/consts";
import { consumeOrThrow } from "@/boxed";
import { walletSigner } from "@/crypto/wallet";
import chalk from "chalk";

export const runGetAddressDetails = async (): Promise<void> => {
  try {
    console.log(
      chalk.yellow(`Your address: ${chalk.bold(walletSigner.address)}`)
    );

    const btcBalance = consumeOrThrow(
      await provider.rpc.electrum.esplora_getaddressbalance(
        walletSigner.address
      )
    );

    console.log(
      chalk.green(`Your Bitcoin balance: ${chalk.bold(btcBalance)} BTC\n\n`)
    );
  } catch (error) {
    console.log(
      chalk.red(
        "An error occurred while running the address details script:",
        error instanceof Error ? error.message : "Unknown error"
      )
    );
    return;
  }
};
