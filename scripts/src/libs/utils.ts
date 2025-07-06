import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import ora from "ora";
import chalk from "chalk";
import { walletSigner } from "@/crypto/wallet";
import { getAlkanesDeploymentParamsFromWasmPath } from "@/crypto/oyl";
import { oylProvider, provider } from "@/consts";
import {
  consumeOrThrow,
  isBoxedError,
  retryOnBoxedError,
  BoxedSuccess,
} from "@/boxed";
import { getCurrentTaprootAddress } from "@/crypto/wallet";
import { getOylSignerFromWalletSigner } from "@/crypto/oyl";
import { contractDeployment } from "@/libs/alkanes/contract";
import {
  AlkaneId,
  AlkanesTraceError,
  AlkanesTraceResult,
} from "tacoclicker-sdk";

const execPromise = promisify(exec);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const waitForTrace = async (
  txid: string
): Promise<AlkanesTraceResult> => {
  let traceResult: AlkanesTraceResult | undefined;
  while (traceResult === undefined) {
    let traceResults = (
      await Promise.all([provider.trace(txid, 3), provider.trace(txid, 4)])
    ).filter((result) => {
      if (isBoxedError(result)) {
        if (result.errorType === AlkanesTraceError.TransactionReverted) {
          throw new Error(result.message);
        }
        return false;
      }
      return true;
    }) as BoxedSuccess<AlkanesTraceResult>[]; //Safe because isBoxedError checks

    traceResult = traceResults.find((result) => result.data.length)?.data;

    await sleep(2000);
  }
  return traceResult;
};

const INDENT = 2; // how many spaces to indent sub-tasks
const task = chalk.bold.cyan; // style for the top-level task label
const note = (s: string) => chalk.dim("· " + s); // subtle bullet for secondary notes

export const deployContract = async (
  cargoProjectPath: string,
  extraCallData: bigint[] = []
): Promise<AlkaneId> => {
  let contractName = path.basename(cargoProjectPath);
  console.log(task(`\n▶ deploy ${contractName}`)); // ——— top-level task banner

  /* -------------------------------------------------- build WASM */
  const buildSpinner = ora({
    text: note("building contract"),
    indent: INDENT,
  }).start();
  try {
    await execPromise("cargo build --target wasm32-unknown-unknown --release", {
      cwd: cargoProjectPath,
    });
    buildSpinner.succeed(chalk.green("contract built"));
  } catch (err) {
    buildSpinner.fail(chalk.red("build failed"));
    throw err instanceof Error ? err : new Error(String(err));
  }

  /* -------------------------------------------------- locate artifact */
  const wasmDir = path.join(
    cargoProjectPath,
    "target",
    "wasm32-unknown-unknown",
    "release"
  );
  const wasmFiles = (await fs.readdir(wasmDir)).filter((f) =>
    f.endsWith(".wasm")
  );
  if (wasmFiles.length === 0) {
    throw new Error(`no .wasm artifact found in ${wasmDir}`);
  }
  const wasmPath = path.join(wasmDir, wasmFiles[0]);
  console.log(note(`found WASM → ${path.basename(wasmPath)}`));

  /* -------------------------------------------------- create payload */
  const { payload, protostone } = await getAlkanesDeploymentParamsFromWasmPath(
    wasmPath,
    [1n, 0n, ...(extraCallData ?? [])]
  );

  /* -------------------------------------------------- gather UTXOs */
  const formattedUtxos = consumeOrThrow(
    await provider.rpc.sandshrew.sandshrew_getFormattedUtxosForAddress(
      getCurrentTaprootAddress(walletSigner.signer)
    )
  );
  const gatheredUtxos = {
    utxos: formattedUtxos,
    totalAmount: formattedUtxos.reduce((sum, u) => sum + u.satoshis, 0),
  };
  console.log(
    note(
      `gathered ${chalk.yellow(gatheredUtxos.utxos.length)} UTXO${
        gatheredUtxos.utxos.length !== 1 ? "s" : ""
      } (${gatheredUtxos.totalAmount} sats)`
    )
  );

  /* -------------------------------------------------- broadcast tx */
  const { oyl: oylAccount, signer: taprootSigner } = walletSigner;
  const oylSigner = getOylSignerFromWalletSigner(taprootSigner);

  const { txId } = await contractDeployment({
    signer: oylSigner,
    account: oylAccount,
    payload,
    protostone: Buffer.from(protostone),
    utxos: gatheredUtxos.utxos,
    provider: oylProvider,
    feeRate: 10, // sat/vB
  });

  console.log(note(`broadcast ${chalk.blue(txId)}, waiting for confirmation…`));

  /* -------------------------------------------------- wait for confirmation */
  while (true) {
    const tx = consumeOrThrow(
      await retryOnBoxedError({
        intervalMs: 1000,
        timeoutMs: 10000,
      })(() => provider.rpc.electrum.esplora_gettransaction(txId))
    );
    if (tx?.status.confirmed) break;
    await sleep(4_000);
  }
  console.log(note("confirmed — waiting for trace…"));

  /* -------------------------------------------------- wait for trace */
  const events: AlkanesTraceResult = await waitForTrace(txId);
  const create = events.find((e) => e.event === "create");
  if (!create) throw new Error("no `create` event found in trace output");

  const { block, tx } = create.data as { block: bigint; tx: bigint };
  const alkaneId: AlkaneId = { block, tx };

  console.log(
    chalk.green(
      `✓ contract deployed at block ${block.toString()}, tx ${tx.toString()}\n`
    )
  );
  return alkaneId;
};
