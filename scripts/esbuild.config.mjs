// esbuild.config.mjs
import { build } from "esbuild";
import dotenv from "dotenv";
import fs from "fs";

const env = dotenv.parse(fs.readFileSync(".env"));

// Manually clean up any weird Windows variables
const sanitizedEnv = Object.fromEntries(
  Object.entries(env).filter(
    ([key]) => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key) // Only allow valid JS identifiers
  )
);

const silentDotenvLogsPlugin = {
  name: "silent-dotenv-logs",
  setup(build) {
    build.onLoad({ filter: /dotenv\/lib\/main\.js$/ }, async (args) => {
      let contents = await fs.promises.readFile(args.path, "utf8");

      // Replace log lines with no-ops
      contents = contents
        .replace(/console\.log\(.*?\);?/g, "")
        .replace(/console\.error\(.*?\);?/g, "");

      return {
        contents,
        loader: "js",
      };
    });
  },
};

await build({
  entryPoints: ["src/index.ts"],
  outfile: "dist/index.js",
  bundle: true,
  platform: "node",
  target: "node18",
  format: "cjs",
  define: Object.fromEntries(
    Object.entries(sanitizedEnv).map(([key, val]) => [
      `process.env.${key}`,
      JSON.stringify(val),
    ])
  ),
  plugins: [silentDotenvLogsPlugin],
});
