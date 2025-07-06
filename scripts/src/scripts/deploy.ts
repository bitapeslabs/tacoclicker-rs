import path from "path";
import { deployContract } from "@/libs/utils";
import { AlkaneId } from "tacoclicker-sdk";
import chalk from "chalk";

const readableAlkaneId = (alkaneId: AlkaneId) => {
  return `(block->${Number(alkaneId.block)}n:tx->${Number(alkaneId.tx)}n)`;
};

export const deploy = async (): Promise<void> => {
  try {
    const tortillaContract = await deployContract(
      path.join(__dirname, "..", "..", "./contracts/tortilla")
    );

    const taqueriaFactoryContract = await deployContract(
      path.join(__dirname, "..", "..", "./contracts/taqueria-factory"),
      [...Object.values(tortillaContract)]
    );

    return;
  } catch (error) {
    console.log(
      chalk.red("❌ Error deploying contract(s): " + (error as Error).message)
    );
    process.exit(0);
  }
};
