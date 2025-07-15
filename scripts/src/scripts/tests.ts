import { BoxedSuccess, consumeOrThrow } from "@/boxed";
import { taskLogger as logger, provider } from "@/consts";
import { walletSigner } from "@/crypto/wallet";
import { abi, AlkanesBaseContract, SingularAlkanesTransfer } from "tacoclicker-sdk";
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

  theirmethod: abi.opcode(1n).execute(myschema).returns(myschema),
  inscribe: abi.opcode(2n).execute(undefined, myschema).returns("uint8Array"),
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
    const test = consumeOrThrow(
      await contract.inscribe(
        "asd",
        { message: "please inscribe this" },
        {
          transfers: [
            {
              asset: {
                block: 2n,
                tx: 101n,
              },
              address: walletSigner.address,
              amount: 10n,
            } as SingularAlkanesTransfer,
          ],
        }
      )
    );
    console.log("Test method result:", test);

    return true;
  } catch (error) {
    console.error(error);
    logger.error(error as Error);
    root.close();
    process.exit(1);
  }
};
