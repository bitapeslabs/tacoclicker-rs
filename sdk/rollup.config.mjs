// rollup.config.mjs
import dts from "rollup-plugin-dts";

export default {
  input: "dist/index.d.ts", // entry point for declarations
  output: {
    file: "dist/index.d.ts", // overwrite with flattened file
    format: "es",
  },
  plugins: [dts()],
};
