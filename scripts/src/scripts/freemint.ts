import path from "path";
import { deployContract } from "@/libs/utils";
import { AlkaneId, TokenContract } from "tacoclicker-sdk";
import { provider } from "@/consts";
import { walletSigner } from "@/crypto/wallet";
import { taskLogger as logger } from "@/consts";
import { consumeAll, consumeOrThrow } from "@/boxed";

const readableAlkaneId = (id: AlkaneId) =>
  `(block→${Number(id.block)}n : tx→${Number(id.tx)}n)`;

/** Deploy, initialise and mint a Free-Mint token contract. */
export const runFreeMint = async (): Promise<boolean> => {
  const root = logger.start("deploy & inspect free-mint token");

  try {
    const freeMintId = {
      block: 2n,
      tx: 122n,
    };
    logger.success(`contract at ${readableAlkaneId(freeMintId)}`);

    const tokenContract = new TokenContract(
      provider,
      freeMintId,
      walletSigner.signPsbt
    );

    consumeOrThrow(
      await logger.progressExecute(
        "initialize",
        tokenContract.initialize({
          address: walletSigner.address,
          tokenParams: {
            name: "test",
            symbol: "TEST",
            valuePerMint: 10n,
            cap: 1000n,
            premine: 10_000n,
          },
        })
      )
    );

    consumeOrThrow(
      await logger.progressExecute(
        "mint",
        tokenContract.mintTokens(walletSigner.address)
      )
    );

    await logger.info("Getting contract state…");

    let tokenContractReturnValues = consumeAll(
      await Promise.all([
        tokenContract.getName(),
        tokenContract.getSymbol(),
        tokenContract.getTotalSupply(),
        tokenContract.getValuePerMint(),
        tokenContract.getMinted(),
        tokenContract.getCap(),
        tokenContract.getBalance(walletSigner.address),
      ] as const)
    );

    logger.info("Asserting contract state...");
    logger.deepAssert(
      [
        "test",
        "TEST",
        10_010, // totalSupply + minted
        10, // valuePerMint
        1n, // minted
        1000n, // cap
        10_010, //balance (premine + mint)
      ],
      tokenContractReturnValues
    );
    logger.success("All asserts passed. Contract state asserted successfully.");

    const [name, symbol, totalSupply, valuePerMint, minted, cap] =
      tokenContractReturnValues;

    logger.info(`name:          ${name}`);
    logger.info(`symbol:        ${symbol}`);
    logger.info(`totalSupply:   ${totalSupply}`);
    logger.info(`valuePerMint:  ${valuePerMint}`);
    logger.info(`minted:        ${minted}`);
    logger.info(`cap:           ${cap}`);
    root.close();
    return true;
  } catch (err) {
    logger.error(err as Error);
    root.close();
    process.exit(1);
  }
};
