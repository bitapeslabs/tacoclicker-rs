import * as bitcoin from "bitcoinjs-lib";
import { Provider } from "tacoclicker-sdk";
import { consumeOrThrow, isBoxedError } from "./boxed";
import { walletSigner } from "./crypto/wallet";

const provider = new Provider({
  sandshrewUrl: "https://boynet.mezcal.sh/sandshrew",
  electrumApiUrl: "https://boynet.mezcal.sh/esplora",
  network: bitcoin.networks.regtest,
  explorerUrl: "https://boynet.mezcal.sh",
  defaultFeeRate: 5, // Default fee rate in sat/vbyte
});

const start = async () => {
  const { signPsbt } = walletSigner;

  let result = await provider.trace(
    "d115a2745abaa23918d17f1098eb25ce0a261ceafe0b8c9916f4c853e1852374",
    4
  );

  console.log(result);
};
process.removeAllListeners("warning");
process.on("warning", (w) => {
  if (w.name === "DeprecationWarning") return;
  process.emit("warning", w);
});

start();
