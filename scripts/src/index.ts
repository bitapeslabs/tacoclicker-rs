import { simulate } from "tacoclicker-sdk";
import { consumeOrThrow } from "./boxed";
const start = async () => {
  let result = consumeOrThrow(
    await simulate({
      alkanes: [],
      transaction: "0x",
      height: "0xFFFFFF",
      txindex: 0,
      target: {
        block: "2n",
        tx: "10n",
      },
      inputs: ["78n"],
      pointer: 0,
      refundPointer: 0,
      vout: 0,
    })
  );

  console.log("Simulation Result:", result);
};

start();
