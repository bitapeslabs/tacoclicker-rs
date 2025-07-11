// esbuild.config.mjs
import { build } from "esbuild";
import madge from "madge";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import process from "process";
import { fileURLToPath } from "url";

let SKIP_CIRCULAR_DEPENDENCY_CHECK = false;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC_DIR = path.resolve(__dirname, "src");
const TSCONFIG = path.resolve(__dirname, "tsconfig.json");

/* 1 ─── Load & sanitise .env ─────────────────────────────────────────────── */
const env = dotenv.parse(fs.readFileSync(".env"));
const sanitizedEnv = Object.fromEntries(
  Object.entries(env).filter(([k]) => /^[A-Za-z_]\w*$/.test(k))
);

/* 2 ─── Silence dotenv logs ─────────────────────────────────────────────── */
const silentDotenvLogsPlugin = {
  name: "silent-dotenv-logs",
  setup(build) {
    build.onLoad({ filter: /dotenv\/lib\/main\.js$/ }, async ({ path: p }) => {
      let contents = await fs.promises.readFile(p, "utf8");
      contents = contents.replace(/console\.(log|error)\(.*?\);?/g, "");
      return { contents, loader: "js" };
    });
  },
};

/* 3 ─── Build Madge alias map from tsconfig paths (incl. "@/") ──────────── */
function tsconfigPathsToMadgeAlias(tsconfigPath) {
  const cfg = JSON.parse(fs.readFileSync(tsconfigPath, "utf8"));
  const out = {};
  if (cfg.compilerOptions?.paths) {
    for (const [key, [value]] of Object.entries(cfg.compilerOptions.paths)) {
      // strip trailing /* for simplicity
      const keyClean = key.replace(/\/\*$/, "");
      const valueClean = value.replace(/\/\*$/, "");
      out[keyClean] = path.resolve(__dirname, valueClean);
    }
  }
  return out;
}

const madgeAlias = {
  ...tsconfigPathsToMadgeAlias(TSCONFIG),
  "@/": SRC_DIR, // catch plain "@/index" imports
  "@": SRC_DIR,
};

/* 4 ─── Circular-dependency guard ───────────────────────────────────────── */
async function checkCircularDependencies() {
  if (SKIP_CIRCULAR_DEPENDENCY_CHECK) return;

  const result = await madge(SRC_DIR, {
    tsConfig: TSCONFIG, // honour path aliases / baseUrl
    fileExtensions: ["ts", "tsx", "js", "jsx"],
    excludeRegExp: [/node_modules/],
    alias: madgeAlias,
    detectiveOptions: {
      ts: { jsx: true, mixedImports: true },
      es6: { mixedImports: true },
    },
  });

  const cycles = result.circular();
  if (cycles.length) {
    console.error("\n❌  Circular dependencies detected:\n");
    cycles.forEach((loop, i) =>
      console.error(`${i + 1}.  ${loop.join(" → ")}`)
    );
    console.error(
      "\nFix the cycles above (or relax this check) before bundling.\n"
    );
    process.exit(1);
  } else {
    console.log("✅  No circular dependencies found.\n");
  }
}

/* 5 ─── Run guard ➜ esbuild ─────────────────────────────────────────────── */
await checkCircularDependencies();

await build({
  entryPoints: ["src/index.ts"],
  outfile: "dist/index.js",
  bundle: true,
  platform: "node",
  target: "node24",
  format: "cjs",
  define: Object.fromEntries(
    Object.entries(sanitizedEnv).map(([k, v]) => [
      `process.env.${k}`,
      JSON.stringify(v),
    ])
  ),
  plugins: [silentDotenvLogsPlugin],
});
