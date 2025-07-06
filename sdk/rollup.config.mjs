import dts from "rollup-plugin-dts";

export default {
  input: "dist/index.d.ts",
  output: {
    file: "dist/index.d.ts", // flattened output
    format: "es",
  },
  plugins: [dts()],
  preserveSymlinks: true, // <-- add this
};
