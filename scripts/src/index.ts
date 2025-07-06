import { deploy } from "@/scripts";

const start = async () => {
  await deploy();
};
process.removeAllListeners("warning");
process.on("warning", (w) => {
  if (w.name === "DeprecationWarning") return;
  process.emit("warning", w);
});

start();
