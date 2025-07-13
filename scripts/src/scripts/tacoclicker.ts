import path from "path";
import { deployContract } from "@/libs/utils";
import { AlkaneId } from "tacoclicker-sdk";
import { TortillaContract } from "@/contracts/tortilla";
import { provider } from "@/consts";
import { walletSigner } from "@/crypto/wallet";
import { taskLogger as logger } from "@/consts";
import {
  consumeOrThrow,
  BoxedResponse,
  BoxedError,
  isBoxedError,
  BoxedSuccess,
} from "@/boxed";
import { ParsableAlkaneId } from "tacoclicker-sdk";
import { TaqueriaContract } from "@/contracts/taqueria";

const readableAlkaneId = (id: AlkaneId) =>
  `(block→${Number(id.block)}n : tx→${Number(id.tx)}n)`;

const getContracts = async (enableDeploy: boolean) => {
  if (!enableDeploy) {
    return {
      taqueriaFactoryAlkaneId: {
        block: 2n,
        tx: 146n,
      } as AlkaneId,
      tortillaAlkaneId: {
        block: 2n,
        tx: 147n,
      } as AlkaneId,
    };
  }

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

enum TacoclickerRegisterError {
  UnknownError = "UnknownError",
  AssertFailure = "AssertFailure",
}

const testRegister = async (
  tortillaContract: TortillaContract
): Promise<BoxedResponse<boolean, TacoclickerRegisterError>> => {
  try {
    let taqueria = await logger.progressExecute(
      "Register with insufficient funds",
      tortillaContract.register(walletSigner.address, 20_000)
    );

    const expectedError = `TORTILLA: for register, the parent tx must send ${TortillaContract.TAQUERIA_COST_SATS} sats to funding address ${TortillaContract.TORTILLA_FUNDING_ADDRESS}`;

    if (!isBoxedError(taqueria)) {
      return new BoxedError(
        TacoclickerRegisterError.AssertFailure,
        `Expected error, but got success: ${JSON.stringify(taqueria)}`
      );
    } else if (!taqueria.message?.includes(expectedError)) {
      return new BoxedError(
        TacoclickerRegisterError.AssertFailure,
        `Expected error message to include "${expectedError}", but got: ${taqueria.message}`
      );
    }

    logger.success("Asserted insufficient funds error: " + taqueria.message);

    //If this passes the register is working
    const taqueria2 = consumeOrThrow(
      await logger.progressExecute(
        "Register with sufficient funds",
        tortillaContract.register(walletSigner.address)
      )
    ).toObject();

    logger.success(
      "Taqueria registered successfully: " +
        readableAlkaneId(new ParsableAlkaneId(taqueria2).toAlkaneId())
    );

    const registeredTaqueria = new TaqueriaContract(
      provider,
      new ParsableAlkaneId(taqueria2).toAlkaneId(),
      walletSigner.signPsbt
    );

    const balance = consumeOrThrow(
      await registeredTaqueria.viewGetBalance(walletSigner.address)
    );

    logger.deepAssert(1e-8, balance); // unitary balance check

    const addressTaqueria = new ParsableAlkaneId(
      consumeOrThrow(
        await logger.progressAbstract(
          "getAddressTaqueria",
          tortillaContract.viewGetTaqueria(walletSigner.address)
        )
      ).alkaneId
    ).toSchemaAlkaneId();

    logger.deepAssert(
      addressTaqueria,
      taqueria2,
      [],
      "This is WARNONLY because mismatches can happen if the address has registered multiple taquerias, but this is not an issue because only the first one gets shown on frontend."
    );
    return new BoxedSuccess(true);
  } catch (error) {
    logger.error(error as Error);
    return new BoxedError(
      TacoclickerRegisterError.UnknownError,
      "Registration failed: " + (error as Error).message
    );
  }
};

export const runTacoClicker = async (
  enableDeploy?: boolean
): Promise<boolean> => {
  enableDeploy = enableDeploy ?? true;

  const root = logger.start("deploy & inspect taco clicker contracts");

  try {
    let contracts = await getContracts(enableDeploy);

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
            taqueria_factory_alkane_id: new ParsableAlkaneId(
              contracts.taqueriaFactoryAlkaneId
            ).toSchemaAlkaneId(),

            //PLACEHOLDERS. TODO: CHANGE
            salsa_alkane_id: new ParsableAlkaneId({
              block: 0,
              tx: 0n,
            }).toSchemaAlkaneId(),
          })
        )
      );
    }

    let consts = consumeOrThrow(
      await logger.progressAbstract("getConsts", tortillaContract.getConsts())
    );

    logger.info("Asserting tortilla contract state...");
    logger.deepAssert(
      {
        taqueria_factory_alkane_id: new ParsableAlkaneId(
          contracts.taqueriaFactoryAlkaneId
        ).toSchemaAlkaneId(),
        salsa_alkane_id: new ParsableAlkaneId({
          block: 0,
          tx: 0n,
        }).toSchemaAlkaneId(),
      },
      consts
    );

    consumeOrThrow(await testRegister(tortillaContract));

    root.close();
    return true;
  } catch (err) {
    logger.error(err as Error);
    root.close();
    process.exit(1);
  }
};
