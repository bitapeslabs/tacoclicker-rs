import { BoxedSuccess, consumeOrThrow } from "@/boxed";
import { taskLogger as logger, provider } from "@/consts";
import { walletSigner } from "@/crypto/wallet";
import { abi, AlkanesBaseContract } from "tacoclicker-sdk";
import { BorshSchema } from "borsher";
const myschema = BorshSchema.Struct({
  message: BorshSchema.String,
});

const MyContractABI = abi.contract({
  mymethod: abi.opcode(0n).custom(async function (this, address, params: string) {
    console.log("params passed in:", address, params);
    // Custom logic here
    return new BoxedSuccess("Custom method executed successfully");
  }),

  theirmethod: abi.opcode(1n).view(myschema).returns(myschema),
});

class MyContract extends abi.attach(AlkanesBaseContract, MyContractABI) {}

export const runGeneralTest = async (): Promise<boolean> => {
  const root = logger.start("Running general test");
  const contract = new MyContract(
    provider,
    {
      block: 2n,
      tx: 102n,
    },
    walletSigner.signPsbt
  );

  try {
    const test = consumeOrThrow(await contract.theirmethod({ message: "Hello" }));
    console.log("Test method result:", test);

    return true;
  } catch (error) {
    console.error(error);
    logger.error(error as Error);
    root.close();
    process.exit(1);
  }
};
