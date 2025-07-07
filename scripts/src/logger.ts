import chalk from "chalk";
import ora, { Ora } from "ora";

const G = { branch: "├─ ", last: "└─ ", vert: "│  ", blank: "   " };

interface Frame {
  last: boolean;
}

export class TaskLogger {
  private frames: Frame[] = [];

  /* ── helpers ─────────────────────────────────────────────────── */

  /** Build coloured tree prefix for the current depth */
  private prefix(asLast = false): string {
    const raw = this.frames
      .map((f, i, arr) => {
        if (i === arr.length - 1) return asLast ? G.last : G.branch;
        return f.last ? G.blank : G.vert;
      })
      .join("");
    return chalk.cyan(raw); // tint once, reuse everywhere
  }

  /** Pop a frame and re-flag its new parent as `last` */
  private popFrame() {
    this.frames.pop();
    if (this.frames.length) this.frames[this.frames.length - 1].last = true;
    if (this.frames.length === 0) {
      console.log(chalk.cyan(this.prefix() + "└─▶ Finished All Tasks"));
    }
  }

  /* ── public API ──────────────────────────────────────────────── */

  /** Begin a new top-level or nested task; returns a handle with `.close()` */
  start(label: string) {
    if (this.frames.length) this.frames[this.frames.length - 1].last = false; // parent now has sibling
    this.frames.push({ last: true });

    console.log(chalk.bold(this.prefix() + "▶ " + label));

    return { close: () => this.popFrame() };
  }

  /**
   * Convenience wrapper: run an (async) block inside its own task node.
   *
   * Usage:
   *   await logger.withTask("compile", async () => { … })
   */
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

  /** Create an `ora` spinner that keeps the correct prefix */
  progress(msg: string): Ora {
    return ora({
      text: chalk.dim(msg),
      prefixText: this.prefix(true), // spinner & succeed/fail lines align
      indent: 0,
    }).start();
  }
}

/* singleton instance you can import everywhere */
export const taskLogger = new TaskLogger();
