import { runTacoClicker } from "./tacoclicker";
import { runSandbox } from "./sandbox";
import { runFreeMint } from "./freemint";

export const commands = {
  //Deploys, inspects and asserts tests freemint.wasm
  "--freemint": runFreeMint,
  "--tacoclicker": runTacoClicker,
  "--sandbox": runSandbox,
};
