import path from "path";
import { deployContract } from "@/libs/utils";
import { AlkaneId } from "tacoclicker-sdk";

const readableAlkaneId = (alkaneId: AlkaneId) => {
  return `(block->${Number(alkaneId.block)}n:tx->${Number(alkaneId.tx)}n)`;
};

export const deploy = async (): Promise<void> => {
  const tortillaContract = await deployContract(
    path.join(__dirname, "..", "..", "./contracts/tortilla")
  );

  const taqueriaFactoryContract = await deployContract(
    path.join(__dirname, "..", "..", "./contracts/taqueria-factory"),
    [0n, ...Object.values(tortillaContract)]
  );

  return;
};
