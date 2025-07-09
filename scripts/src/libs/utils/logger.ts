import util from "node:util"; // for readable logging … JSON.stringify can choke on circular refs

import {
  BoxedError,
  BoxedResponse,
  BoxedSuccess,
  consumeOrThrow,
} from "@/boxed";
import chalk from "chalk";
import ora, { Ora } from "ora";
import {
  AlkanesExecuteError,
  AlkanesPushExecuteResponse,
} from "tacoclicker-sdk";

const G = { branch: "├─ ", last: "└─ ", vert: "│  ", blank: "   " };

interface Frame {
  last: boolean;
}

export class TaskLogger {
  private frames: Frame[] = [];

  private prefix(asLast = false): string {
    const raw = this.frames
      .map((f, i, arr) => {
        if (i === arr.length - 1) return asLast ? G.last : G.branch;
        return f.last ? G.blank : G.vert;
      })
      .join("");
    return chalk.dim(raw) + chalk.bold(" ");
  }

  private popFrame() {
    this.frames.pop();
    if (this.frames.length) this.frames[this.frames.length - 1].last = true;
    if (this.frames.length === 0) {
      console.log(
        chalk.cyan(this.prefix() + "└─▶ Finished All Tasks - ALKATERRIFIC!")
      );
    }
  }

  start(label: string) {
    if (this.frames.length) this.frames[this.frames.length - 1].last = false; // parent now has sibling
    this.frames.push({ last: true });

    console.log(chalk.bold(this.prefix() + "▶ " + label));

    return { close: () => this.popFrame() };
  }

  withTask<T>(label: string, fn: () => T | Promise<T>): Promise<T> | T {
    const h = this.start(label);

    const finish = () => h.close();

    try {
      const r = fn();
      return r instanceof Promise ? r.finally(finish) : (finish(), r);
    } catch (e) {
      finish();
      throw e;
    }
  }

  info(msg: string) {
    console.log(this.prefix(true) + chalk.dim("· " + msg));
  }
  success(msg: string) {
    console.log(this.prefix(true) + chalk.green("✓ " + msg));
  }
  error(msg: string | Error) {
    console.error(
      this.prefix(true) +
        chalk.red("✗ " + (msg instanceof Error ? msg.message : msg))
    );
  }

  progress(msg: string): Ora {
    return ora({
      text: chalk.dim(msg),
      prefixText: this.prefix(true), // spinner & succeed/fail lines align
      indent: 0,
    }).start();
  }

  async progressExecute<
    T extends BoxedResponse<AlkanesPushExecuteResponse, AlkanesExecuteError>
  >(
    functionName: string,
    executeResponse: Promise<T>
  ): Promise<ReturnType<AlkanesPushExecuteResponse["waitForResult"]>> {
    try {
      this.info(`Executing ${functionName}…`);
      let spinner = this.progress(`submitting ${functionName} tx…`);
      let { txid, waitForResult } = consumeOrThrow(await executeResponse);
      spinner.succeed(`Done. Txid: ${txid}`);

      spinner = this.progress(`waiting for ${functionName} trace…`);
      let res = consumeOrThrow(await waitForResult());
      spinner.succeed("Done.");

      return new BoxedSuccess(res);
    } catch (error) {
      throw (
        "Error during progressExecute: " +
        (error instanceof Error ? error.message : String(error))
      );
    }
  }

  async progressAbstract<T>(
    functionName: string,
    functionResponse: Promise<T> | T
  ): Promise<T> {
    const spinner = this.progress(`executing ${functionName}…`);
    try {
      const result = await functionResponse;
      spinner.succeed(`Done.`);
      return result;
    } catch (error) {
      spinner.fail(`Failed.`);
      throw (
        "Error during progressAbstract: " +
        (error instanceof Error ? error.message : String(error))
      );
    }
  }

  deepAssert(expected: unknown, actual: unknown, path: string[] = []): void {
    const here = path.length ? path.join(".") : "(root)";

    const repr = (v: unknown) => util.inspect(v, { depth: 1, colors: false });

    if (
      typeof expected !== "object" ||
      expected === null ||
      typeof actual !== "object" ||
      actual === null
    ) {
      if (expected === actual) {
        this.success(
          `check passed (${here}): ${repr(expected)} === ${repr(actual)}`
        );
        return;
      }
      this.error(
        `Value mismatch at ${here}: expected ${repr(expected)}, got ${repr(
          actual
        )}`
      );
      throw new Error(`deepAssert failed at ${here}`);
    }

    if (Array.isArray(expected) || Array.isArray(actual)) {
      if (!Array.isArray(expected) || !Array.isArray(actual)) {
        this.error(`Type mismatch at ${here}: one is array, the other is not`);
        throw new Error(`deepAssert failed at ${here}`);
      }
      if (expected.length !== actual.length) {
        this.error(
          `Length mismatch at ${here}: expected ${expected.length}, got ${actual.length}`
        );
        throw new Error(`deepAssert failed at ${here}`);
      }
      expected.forEach((expItem, i) =>
        this.deepAssert(expItem, actual[i], [...path, `[${i}]`])
      );
      return;
    }

    // Plain objects
    const expObj = expected as Record<string, unknown>;
    const actObj = actual as Record<string, unknown>;

    const expKeys = Object.keys(expObj);
    const actKeys = Object.keys(actObj);

    // Key set comparison
    if (
      expKeys.length !== actKeys.length ||
      !expKeys.every((k) => actKeys.includes(k))
    ) {
      this.error(
        `Key mismatch at ${here}: expected keys ${repr(expKeys)}, got ${repr(
          actKeys
        )}`
      );
      throw new Error(`deepAssert failed at ${here}`);
    }

    // Recurse per key
    for (const key of expKeys) {
      this.deepAssert(expObj[key], actObj[key], [...path, key]);
    }
    // Successful object comparison is logged by field checks
  }
}

export const taskLogger = new TaskLogger();
