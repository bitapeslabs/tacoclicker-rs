import { BoxedSuccess, consumeOrThrow } from "@/boxed";
import { taskLogger as logger, provider } from "@/consts";
import { walletSigner } from "@/crypto/wallet";
import {
  abi,
  AlkanesBaseContract,
  DecodableAlkanesResponse,
  SingularAlkanesTransfer,
} from "tacoclicker-sdk";
import { BorshSchema } from "borsher";
import { TacoClickerContract } from "@/contracts/tacoclicker";
import { ParsableAlkaneId } from "tacoclicker-sdk";

const myschema = BorshSchema.Struct({
  message: BorshSchema.String,
});

const MyContractABI = abi.contract({
  mymethod: abi
    .opcode(0n)
    .custom(async function (this, address, params: string) {
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
  const contract = new TacoClickerContract(
    provider,
    {
      block: 2n,
      tx: 190n,
    },
    walletSigner.signPsbt
  );

  try {
    let taqueriaAlkane = consumeOrThrow(
      await contract.getTaqueriaContractForAddress(walletSigner.address)
    );

    let response = consumeOrThrow(
      await contract.getUnclaimedTortillaForTaqueria({
        taqueria: new ParsableAlkaneId(
          taqueriaAlkane.alkaneId
        ).toSchemaAlkaneId(),
      })
    );

    let unclaimed_amount = new DecodableAlkanesResponse(
      response.unclaimed_tortilla
    ).decodeTo("tokenValue");

    console.log("Unclaimed Tortilla Response: ", unclaimed_amount);

    return true;
  } catch (error) {
    console.error(error);
    logger.error(error as Error);
    root.close();
    process.exit(1);
  }
};
