// simulateFreeMint.ts
import { commands } from "./scripts";

const main = async () => {
  const command =
    Object.keys(commands).find(
      (c) =>
        process.argv.includes(c) || process.argv.includes(c.replace("--", "--"))
    ) || process.argv[2];

  if (!command || !commands[command as keyof typeof commands]) {
    console.error(
      `Unknown command "${command}". Available commands: ${Object.keys(
        commands
      ).join(", ")}`
    );
    process.exit(1);
  }

  const commandFn = commands[command as keyof typeof commands];
  commandFn();
};

process.removeAllListeners("warning");
process.on("warning", (w) => {
  if (w.name !== "DeprecationWarning") process.emit("warning", w);
});

main();
