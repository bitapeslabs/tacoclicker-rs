import path from "path";
import { deployContract } from "@/libs/utils";
import { AlkaneId, BaseTokenContract } from "tacoclicker-sdk";
import { provider } from "@/consts";
import { getCurrentTaprootAddress, walletSigner } from "@/crypto/wallet";
import { consumeOrThrow } from "@/boxed";
import { taskLogger as logger } from "@/consts";
import { consumeAll } from "@/boxed";

const readableAlkaneId = (id: AlkaneId) =>
  `(block→${Number(id.block)}n : tx→${Number(id.tx)}n)`;

/** Deploy, initialise and mint a Free-Mint token contract. */
export const runDeployAndInspectFreeMint = async (): Promise<boolean> => {
  const root = logger.start("deploy & inspect free-mint token");

  try {
    /* ── deploy contract ─────────────────────────────────────── */
    const freeMintId = await deployContract(
      path.join(__dirname, "..", "..", "..", "free-mint"),
      [100n] // view-method quirk
    );
    logger.success(`contract at ${readableAlkaneId(freeMintId)}`);

    /* ── wrap SDK object ─────────────────────────────────────── */
    const tokenContract = new BaseTokenContract(
      provider,
      freeMintId,
      walletSigner.signPsbt
    );
    const address = await getCurrentTaprootAddress(walletSigner.signer);

    /* ── initialise ──────────────────────────────────────────── */
    const initSpin = logger.progress("submitting initialise tx…");
    const initRes = consumeOrThrow(
      await tokenContract.initialize(address, {
        name: "Free Mint Token",
        symbol: "FMT",
        valuePerMint: 10n,
        cap: 1000n,
        premine: 10_000n,
      })
    );
    initSpin.succeed(`txid ${initRes.txid}`);

    const initWait = logger.progress("waiting for initialise trace…");
    await initRes.waitForResult();
    initWait.succeed("initialised");

    /* ── first mint ──────────────────────────────────────────── */
    const mintSpin = logger.progress("submitting mint tx…");
    const mintRes = consumeOrThrow(await tokenContract.mintTokens(address));
    mintSpin.succeed(`txid ${mintRes.txid}`);

    const mintWait = logger.progress("waiting for mint trace…");
    await mintRes.waitForResult();
    mintWait.succeed("mint successful");

    await logger.withTask("read contract state", async () => {
      const [name, symbol, totalSupply, valuePerMint, minted, cap] = consumeAll(
        await Promise.all([
          tokenContract.viewGetName(),
          tokenContract.viewGetSymbol(),
          tokenContract.viewGetTotalSupply(),
          tokenContract.viewGetValuePerMint(),
          tokenContract.viewGetMinted(),
          tokenContract.viewGetCap(),
        ] as const)
      );

      logger.info(`name:          ${name}`);
      logger.info(`symbol:        ${symbol}`);
      logger.info(`totalSupply:   ${totalSupply}`);
      logger.info(`valuePerMint:  ${valuePerMint}`);
      logger.info(`minted:        ${minted}`);
      logger.info(`cap:           ${cap}`);
      logger.success("contract state fetched");
    });
    root.close();
    return true;
  } catch (err) {
    logger.error(err as Error);
    root.close();
    process.exit(1);
  }
};
