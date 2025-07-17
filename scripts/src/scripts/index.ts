import { runTacoClicker } from "./tacoclicker";
import { runSandbox } from "./sandbox";
import { runFreeMint } from "./freemint";
import { runGetAddressDetails } from "./address";
import { runCommitRevealInscriptionTest } from "./testinscription";
import { runGeneralTest } from "./tests";
import { generateMerkleTree } from "./genmerkletree";

export const commands = {
  //Deploys, inspects and asserts tests freemint.wasm
  "--freemint": runFreeMint,
  "--tacoclicker": runTacoClicker,
  "--sandbox": runSandbox,
  "--address": runGetAddressDetails,
  "--testinscription": runCommitRevealInscriptionTest,
  "--test": runGeneralTest,
  "--genmerkletree": generateMerkleTree,
};
