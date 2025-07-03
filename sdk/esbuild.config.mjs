// esbuild.config.mjs
import { build } from "esbuild";
import fs from "fs";

await build({
  entryPoints: ["src/index.ts"],
  outfile: "dist/index.js",
  bundle: true,
  platform: "node",
  target: "node18",
  format: "cjs",
});
