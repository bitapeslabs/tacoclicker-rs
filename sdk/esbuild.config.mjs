// esbuild.config.mjs -----------------------------------------------------------
import { build } from "esbuild";
import { execSync } from "child_process";
import fs from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

import * as acorn from "acorn";
import * as walk from "acorn-walk";
import MagicString from "magic-string";

/* ────────────────────────────────────────────────────────────── */
/* 1.  Nuke the dist folder BEFORE we do anything else            */
/* ────────────────────────────────────────────────────────────── */
const distDir = path.resolve("dist");

if (fs.existsSync(distDir)) {
  fs.rmSync(distDir, { recursive: true, force: true });
}
fs.mkdirSync(distDir, { recursive: true }); // ensure it exists again
/* ────────────────────────────────────────────────────────────── */

/* 2.  Generate .d.ts (tsc) and rewrite aliases                   */
execSync("tsc --emitDeclarationOnly --declaration --outDir dist", {
  stdio: "inherit",
});
execSync("tsc-alias -p tsconfig.json", { stdio: "inherit" });

/* 3.  Bundle type-only entrypoints with Rollup (if any)          */
execSync("rollup -c rollup.config.mjs", { stdio: "inherit" });

/* 4.  Remove stray .d.ts files & empty sub-dirs produced above   */
fs.readdirSync(distDir, { withFileTypes: true }).forEach((entry) => {
  const fullPath = path.join(distDir, entry.name);
  if (entry.isDirectory()) {
    fs.rmSync(fullPath, { recursive: true, force: true });
  } else if (entry.name !== "index.d.ts" && entry.name.endsWith(".d.ts")) {
    fs.rmSync(fullPath);
  }
});

/* 5.  ESBuild bundling with custom plugin                        */
const removeNegZeroPlugin = {
  name: "remove-negative-zero",
  setup(build) {
    build.onLoad({ filter: /\.[cm]?[jt]s$/ }, async (args) => {
      const code = await readFile(args.path, "utf8");

      if (!code.includes("-0")) {
        return { contents: code, loader: pickLoader(args.path) };
      }

      const ms = new MagicString(code);
      const ast = acorn.parse(code, {
        ecmaVersion: "latest",
        sourceType: "module",
      });

      walk.simple(ast, {
        UnaryExpression(node) {
          if (
            node.operator === "-" &&
            node.argument.type === "Literal" &&
            node.argument.value === 0
          ) {
            ms.overwrite(node.start, node.end, "0");
          }
        },
      });

      return {
        contents: ms.toString(),
        loader: pickLoader(args.path),
      };
    });
  },
};

function pickLoader(file) {
  return file.endsWith(".ts") || file.endsWith(".mts")
    ? "ts"
    : file.endsWith(".cts")
      ? "cts"
      : "js";
}

await build({
  entryPoints: ["src/index.ts"],
  outfile: path.join(distDir, "index.js"),
  bundle: true,
  platform: "node",
  target: "node18",
  format: "cjs",
  plugins: [removeNegZeroPlugin],
});
