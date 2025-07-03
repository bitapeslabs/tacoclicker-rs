// esbuild.config.mjs
import { build } from "esbuild";
import { execSync } from "child_process";
import fs from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

import * as acorn from "acorn";
import * as walk from "acorn-walk";
import MagicString from "magic-string";

execSync("tsc --emitDeclarationOnly --declaration --outDir dist", {
  stdio: "inherit",
});
execSync("tsc-alias -p tsconfig.json", { stdio: "inherit" });

execSync("rollup -c rollup.config.mjs", { stdio: "inherit" });

const distDir = path.resolve("dist");
fs.readdirSync(distDir, { withFileTypes: true }).forEach((entry) => {
  const fullPath = path.join(distDir, entry.name);
  if (entry.isDirectory()) {
    fs.rmSync(fullPath, { recursive: true, force: true });
  } else if (entry.name !== "index.d.ts" && entry.name.endsWith(".d.ts")) {
    fs.rmSync(fullPath);
  }
});

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
            // Overwrite from start of "-" to end of "0"
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
  outfile: "dist/index.js",
  bundle: true,
  platform: "node",
  target: "node18",
  format: "cjs",
  plugins: [removeNegZeroPlugin],
});
