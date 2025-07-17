import util from "node:util"; // for readable logging … JSON.stringify can choke on circular refs

import {
  BoxedError,
  BoxedResponse,
  BoxedSuccess,
  consumeOrThrow,
  IBoxedSuccess,
} from "@/boxed";
import chalk from "chalk";
import ora, { Ora, spinners } from "ora";
import {
  AlkanesExecuteError,
  AlkanesPushExecuteResponse,
} from "tacoclicker-sdk";

const G = { branch: "├─ ", last: "└─ ", vert: "│  ", blank: "   " };

interface Frame {
  last: boolean;
}

enum LoggerError {
  UnknownError = "UnknownError",
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

  warn(msg: string) {
    console.log(this.prefix(true) + chalk.yellow("! " + msg));
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

  async progressExecute<T>(
    functionName: string,
    executeResponse: Promise<
      BoxedResponse<AlkanesPushExecuteResponse<T | never>, AlkanesExecuteError>
    >

    //iliketurtles
  ): Promise<
    BoxedResponse<
      Extract<
        Awaited<ReturnType<AlkanesPushExecuteResponse<T>["waitForResult"]>>,
        IBoxedSuccess<unknown>
      >["data"],
      LoggerError
    >
  > {
    let spinner = this.progress(`submitting ${functionName} tx…`);

    try {
      let { txid, waitForResult } = consumeOrThrow(await executeResponse);
      spinner.succeed(`Done. Txid: ${txid}`);

      spinner = this.progress(`waiting for ${functionName} trace…`);
      let res = consumeOrThrow(await waitForResult());

      spinner.succeed("Done.");

      return new BoxedSuccess(res);
    } catch (error) {
      spinner.stop();
      console.error(error);

      return new BoxedError(
        LoggerError.UnknownError,
        "Execution failed: " + (error as Error).message
      );
    }
  }

  async progressAbstract<T>(
    functionName: string,
    functionResponse:
      | Promise<BoxedResponse<T, string>>
      | BoxedResponse<T, string>
  ): Promise<BoxedResponse<T, LoggerError>> {
    const spinner = this.progress(`executing ${functionName}…`);
    try {
      const result = consumeOrThrow(await functionResponse);
      spinner.succeed(`Done.`);
      return new BoxedSuccess(result as T);
    } catch (error) {
      spinner.stop();
      console.error(error);

      return new BoxedError(
        LoggerError.UnknownError,
        "Error during progressAbstract: " + (error as Error).message
      );
    }
  }

  deepAssert(
    expected: unknown,
    actual: unknown,
    path: string[] = [],
    warnReason?: string // ← NEW: explain why we’re warning
  ): void {
    const here = path.length ? path.join(".") : "(root)";

    // warn is active if a non-empty reason was provided
    const warnEnabled = !!warnReason && warnReason.trim().length > 0;
    const reasonSuffix = warnEnabled ? ` (reason: ${warnReason})` : "";

    const repr = (v: unknown) => util.inspect(v, { depth: 1, colors: false });

    /* ─────────── primitive / null / undefined ─────────── */
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

      const msg = `Value mismatch at ${here}: expected ${repr(
        expected
      )}, got ${repr(actual)}`;
      if (warnEnabled) {
        this.warn(`(warning) ${msg}${reasonSuffix}`);
        return;
      }
      this.error(msg);
      throw new Error(`deepAssert failed at ${here}`);
    }

    /* ─────────── arrays ─────────── */
    if (Array.isArray(expected) || Array.isArray(actual)) {
      if (!Array.isArray(expected) || !Array.isArray(actual)) {
        const msg = `Type mismatch at ${here}: one is array, the other is not`;
        if (warnEnabled) {
          this.warn(`(warning) ${msg}${reasonSuffix}`);
          return;
        }
        this.error(msg);
        throw new Error(`deepAssert failed at ${here}`);
      }

      if (expected.length !== actual.length) {
        const msg = `Length mismatch at ${here}: expected ${expected.length}, got ${actual.length}`;
        if (warnEnabled) {
          this.warn(`(warning) ${msg}${reasonSuffix}`);
          return;
        }
        this.error(msg);
        throw new Error(`deepAssert failed at ${here}`);
      }

      expected.forEach((expItem, i) =>
        this.deepAssert(expItem, actual[i], [...path, `[${i}]`], warnReason)
      );
      return;
    }

    /* ─────────── plain objects ─────────── */
    const expObj = expected as Record<string, unknown>;
    const actObj = actual as Record<string, unknown>;

    const expKeys = Object.keys(expObj);
    const actKeys = Object.keys(actObj);

    if (
      expKeys.length !== actKeys.length ||
      !expKeys.every((k) => actKeys.includes(k))
    ) {
      const msg = `Key mismatch at ${here}: expected keys ${repr(
        expKeys
      )}, got ${repr(actKeys)}`;
      if (warnEnabled) {
        this.warn(`(warning) ${msg}${reasonSuffix}`);
        return;
      }
      this.error(msg);
      throw new Error(`deepAssert failed at ${here}`);
    }

    for (const key of expKeys) {
      this.deepAssert(expObj[key], actObj[key], [...path, key], warnReason);
    }
  }
}
export const taskLogger = new TaskLogger();
