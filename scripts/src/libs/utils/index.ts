// libs/utils/deployContract.ts
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import chalk from "chalk";

import {
  getAlkanesDeploymentParamsFromWasmPath,
  getOylSignerFromWalletSigner,
} from "@/crypto/oyl";
import { walletSigner, getCurrentTaprootAddress } from "@/crypto/wallet";
import { oylProvider, provider } from "@/consts";
import { consumeOrThrow } from "@/boxed";
import { contractDeployment } from "@/libs/alkanes/contract";
import { taskLogger as logger } from "@/consts";

import { AlkaneId, AlkanesParsedTraceResult } from "tacoclicker-sdk";

const execPromise = promisify(exec);

export const deployContract = async (
  cargoProjectPath: string,
  extraCallData: bigint[] = []
): Promise<AlkaneId> => {
  const contractName = path.basename(cargoProjectPath);
  const root = logger.start(`deploy ${contractName}`);

  try {
    /* ── build ─────────────────────────────── */
    const buildSpin = logger.progress("building contract…");
    await execPromise("cargo build --target wasm32-unknown-unknown --release", {
      cwd: cargoProjectPath,
    });
    buildSpin.succeed("contract built");

    /* ── locate wasm ───────────────────────── */
    const wasmDir = path.join(
      cargoProjectPath,
      "target",
      "wasm32-unknown-unknown",
      "release"
    );
    const files = (await fs.readdir(wasmDir)).filter((f) =>
      f.endsWith(".wasm")
    );
    if (!files.length) throw new Error(`no .wasm in ${wasmDir}`);
    const wasmPath = path.join(wasmDir, files[0]);
    logger.info(`found ${path.basename(wasmPath)}`);

    /* ── payload / protostone ──────────────── */
    const { payload, protostone } =
      await getAlkanesDeploymentParamsFromWasmPath(wasmPath, [
        1n,
        0n,
        ...extraCallData,
      ]);

    /* ── gather UTXOs ──────────────────────── */
    const utxos = consumeOrThrow(
      await provider.rpc.sandshrew.sandshrew_getFormattedUtxosForAddress(
        getCurrentTaprootAddress(walletSigner.signer)
      )
    );
    const total = utxos.reduce((s, u) => s + u.satoshis, 0);
    logger.info(
      `gathered ${chalk.yellow(utxos.length)} UTXO${
        utxos.length === 1 ? "" : "s"
      } (${total} sats)`
    );

    /* ── broadcast tx ──────────────────────── */
    const broadcastSpin = logger.progress("broadcasting tx…");
    const { oyl: account, signer } = walletSigner;
    const { txId } = await contractDeployment({
      signer: getOylSignerFromWalletSigner(signer),
      account,
      payload,
      protostone: Buffer.from(protostone),
      utxos,
      provider: oylProvider,
      feeRate: provider.defaultFeeRate, // sat/vB
    });
    broadcastSpin.succeed(`txid ${chalk.blue(txId)}`);

    /* ── confirmation ─────────────────────── */
    const confirmSpin = logger.progress("waiting for confirmation…");
    await provider.waitForConfirmation(txId);
    confirmSpin.succeed("transaction confirmed");

    /* ── trace result ──────────────────────── */
    const traceSpin = logger.progress("waiting for trace…");
    const events: AlkanesParsedTraceResult = consumeOrThrow(
      await provider.waitForTraceResult(txId)
    );
    traceSpin.stop(); // use stop() because we print success just after

    if (!events.create) throw new Error("no `create` event in trace output");

    const alkaneId: AlkaneId = {
      block: BigInt(events.create.block),
      tx: BigInt(events.create.tx),
    };

    logger.success(
      `contract deployed at block ${Number(alkaneId.block)}, tx ${Number(
        alkaneId.tx
      )}`
    );
    root.close();
    return alkaneId;
  } catch (err) {
    logger.error(err as Error);
    root.close();
    throw err;
  }
};

export * from "./logger";
