import path from "path";
import { deployContract } from "@/libs/utils";
import { AlkaneId } from "tacoclicker-sdk";
import { TortillaContract } from "@/contracts/tortilla";
import { provider } from "@/consts";
import { walletSigner } from "@/crypto/wallet";
import { taskLogger as logger } from "@/consts";
import { consumeOrThrow } from "@/boxed";

const readableAlkaneId = (id: AlkaneId) =>
  `(block→${Number(id.block)}n : tx→${Number(id.tx)}n)`;

const getContracts = async () => {
  const taqueriaFactoryAlkaneId = await deployContract(
    path.join(__dirname, "../..", "./contracts/taqueria-factory"),
    [100n] // view-method quirk
  );
  logger.success(`contract at ${readableAlkaneId(taqueriaFactoryAlkaneId)}`);

  const tortillaAlkaneId = await deployContract(
    path.join(__dirname, "../..", "./contracts/tortilla"),
    [100n] // view-method quirk
  );
  logger.success(`contract at ${readableAlkaneId(tortillaAlkaneId)}`);

  return {
    taqueriaFactoryAlkaneId,
    tortillaAlkaneId,
  };
};

export const runTacoClicker = async (
  enableDeploy?: boolean
): Promise<boolean> => {
  enableDeploy = enableDeploy ?? true;

  const root = logger.start("deploy & inspect taco clicker contracts");

  try {
    let contracts = enableDeploy
      ? await getContracts()
      : {
          taqueriaFactoryAlkaneId: {
            block: 2n,
            tx: 64n,
          } as AlkaneId,
          tortillaAlkaneId: {
            block: 2n,
            tx: 65n,
          } as AlkaneId,
        };

    logger.success(
      `contract at ${readableAlkaneId(contracts.tortillaAlkaneId)}`
    );

    const tortillaContract = new TortillaContract(
      provider,
      contracts.tortillaAlkaneId,
      walletSigner.signPsbt
    );

    if (enableDeploy) {
      consumeOrThrow(
        await logger.progressExecute(
          "Initialize",
          tortillaContract.initialize(walletSigner.address, {
            taqueria_factory_alkane_id: {
              block: Number(contracts.taqueriaFactoryAlkaneId.block),
              tx: Number(contracts.taqueriaFactoryAlkaneId.tx),
            },
            salsa_alkane_id: {
              block: 0, // Placeholder, replace with actual salsa alkane id if needed
              tx: 0, // Placeholder, replace with actual salsa alkane id if needed
            },
          })
        )
      );
    }

    let consts = consumeOrThrow(
      await logger.progressAbstract("getConsts", tortillaContract.getConsts())
    );

    logger.deepAssert(
      {
        taqueria_factory_alkane_id: {
          block: Number(contracts.taqueriaFactoryAlkaneId.block),
          tx: Number(contracts.taqueriaFactoryAlkaneId.tx),
        },
        salsa_alkane_id: {
          block: 0, // Placeholder, replace with actual salsa alkane id if needed
          tx: 0, // Placeholder, replace with actual salsa alkane id if needed
        },
      },
      consts
    );

    root.close();
    return true;
  } catch (err) {
    logger.error(err as Error);
    root.close();
    process.exit(1);
  }
};
