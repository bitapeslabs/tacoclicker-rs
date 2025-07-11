import { runTacoClicker } from "./tacoclicker";
import { runSandbox } from "./sandbox";
import { runFreeMint } from "./freemint";
import { runGetAddressDetails } from "./address";

export const commands = {
  //Deploys, inspects and asserts tests freemint.wasm
  "--freemint": runFreeMint,
  "--tacoclicker": runTacoClicker,
  "--sandbox": runSandbox,
  "--address": runGetAddressDetails,
};
