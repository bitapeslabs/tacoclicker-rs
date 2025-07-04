import * as bitcoin from "bitcoinjs-lib";
import { Provider } from "tacoclicker-sdk";
import { consumeOrThrow, isBoxedError } from "./boxed";

const provider = new Provider({
  sandshrewUrl: "https://boynet.mezcal.sh/sandshrew",
  electrumApiUrl: "https://boynet.mezcal.sh/esplora",
  network: bitcoin.networks.regtest,
  explorerUrl: "https://boynet.mezcal.sh",
  defaultFeeRate: 5, // Default fee rate in sat/vbyte
});

const start = async () => {
  let result = await provider.execute({
    address: "bcrt1p3xw7j2hmj8j6npttr77kzyt5gq5d338nhfq3dwm6qqru99nzusjqsvrlpw",
    callData: [5n, 10n],
  });

  if (isBoxedError(result)) {
    console.error("Error during simulation:", result.message);
    return;
  }

  console.log("Simulation Result:", result);
};
process.removeAllListeners("warning");
process.on("warning", (w) => {
  if (w.name === "DeprecationWarning") return;
  process.emit("warning", w);
});

start();
