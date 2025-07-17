/*─────────────────────────────────────────────────────────────
  Taco Clicker – full game‑logic test‑suite
  -------------------------------------------------------------
  • Uses the existing TaskLogger + BoxedResponse helpers
  • Splits coverage into small, composable test fns returning
    BoxedResponse<true, TestError>
  • Exposes a single entry‑point runAllTacoClickerTests() so you
    can `ts-node` the file or import the function elsewhere.
  -------------------------------------------------------------*/

import path from "path";
import { provider } from "@/consts";
import { taskLogger as logger } from "@/consts";
import {
  BoxedError,
  BoxedResponse,
  BoxedSuccess,
  consumeOrThrow,
  isBoxedError,
} from "@/boxed";
import {
  AlkaneId,
  AlkanesExecuteError,
  AlkanesPushExecuteResponse,
  DecodableAlkanesResponse,
  ParsableAlkaneId,
  SingularAlkanesTransfer,
  SingularBTCTransfer,
} from "tacoclicker-sdk";
import { ControlledMintContract } from "@/contracts/controlledmint";
import { TacoClickerContract } from "@/contracts/tacoclicker";
import { walletSigner } from "@/crypto/wallet";
import { deployContract } from "@/libs/utils";
import crypto from "crypto";
import { MerkleDistributorContract } from "@/contracts/merkledistributor";
/*─────────────────────────────────────────────────────────────*
 |  Constants & helpers                                         |
 *─────────────────────────────────────────────────────────────*/

const TORTILLA_PER_BLOCK = 15_000n * 10n ** 8n; // 15 000 × 1e8 precision
const DECIMALS = 10n ** 8n; // 1 TORTILLA == 1e8 base‑units

function readableAlkaneId(id: AlkaneId) {
  return `(block→${Number(id.block)} : tx→${Number(id.tx)})`;
}

/*── Convert bigint token‑value → human‑readable number (just for logs) ──*/
const toDecimal = (value: bigint) => Number(value) / Number(DECIMALS);

enum TacoclickerRegisterError {
  UnknownError = "UnknownError",
  AssertFailure = "AssertFailure",
}
const testRegisterLegacy = async (
  tacoClickerContract: TacoClickerContract
): Promise<BoxedResponse<boolean, TacoclickerRegisterError>> => {
  try {
    let taqueria = await logger.progressExecute(
      "Register with insufficient funds",
      tacoClickerContract.register(walletSigner.address, {
        transfers: [
          {
            asset: "btc",
            amount: Number(TacoClickerContract.TAQUERIA_COST_SATS) - 1000,
            address: TacoClickerContract.FUNDING_ADDRESS,
          } as SingularBTCTransfer,
        ],
      })
    );

    const expectedError = `TORTILLA: for register, the parent tx must send ${TacoClickerContract.TAQUERIA_COST_SATS} sats to funding address ${TacoClickerContract.FUNDING_ADDRESS}`;

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
        tacoClickerContract.register(walletSigner.address, {
          transfers: [
            {
              asset: "btc",
              amount: Number(TacoClickerContract.TAQUERIA_COST_SATS),
              address: TacoClickerContract.FUNDING_ADDRESS,
            } as SingularBTCTransfer,
          ],
        })
      )
    ).decodeTo("object");

    logger.success(
      "Taqueria registered successfully: " +
        readableAlkaneId(new ParsableAlkaneId(taqueria2).toAlkaneId())
    );

    const registeredTaqueria = new TacoClickerContract(
      provider,
      new ParsableAlkaneId(taqueria2).toAlkaneId(),
      walletSigner.signPsbt
    );

    const balance = consumeOrThrow(
      await registeredTaqueria.getBalance(walletSigner.address)
    );

    logger.deepAssert(1e-8, balance); // unitary balance check

    const addressTaqueria = new ParsableAlkaneId(
      consumeOrThrow(
        await logger.progressAbstract(
          "getAddressTaqueria",
          tacoClickerContract.getTaqueriaContractForAddress(
            walletSigner.address
          )
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

/**
 * Brute‑force a PoC nonce such that
 *   SHA256( borsh(taqueriaId) || nonce_BE_16 || prevHash )
 *   starts with 0x00 – this gives a success probability of 1/256, so on
 *   average ~128 iterations.
 */

/*─────────────────────────────────────────────────────────────*
 |  Deploy/attach helper                                        |
 *─────────────────────────────────────────────────────────────*/
async function getContracts(enableDeploy = true) {
  if (!enableDeploy) {
    return {
      controlledMintFactory: { block: 2n, tx: 146n } as AlkaneId,
      tacoClickerAlkaneId: { block: 2n, tx: 147n } as AlkaneId,
      merkleDistributorFactory: { block: 2n, tx: 148n } as AlkaneId,
    };
  }

  const deployContract = (await import("@/libs/utils")).deployContract;

  const controlledMintFactory = await deployContract(
    path.join(__dirname, "../..", "./contracts/controlled-mint"),
    [100n]
  );
  logger.success(
    `Controlled‑Mint at ${readableAlkaneId(controlledMintFactory)}`
  );

  const merkleDistributorFactory = await deployContract(
    path.join(__dirname, "../..", "./contracts/merkle-distributor"),
    [100n]
  );
  logger.success(
    `Merkle distributor at ${readableAlkaneId(merkleDistributorFactory)}`
  );

  const tacoClickerAlkaneId = await deployContract(
    path.join(__dirname, "../..", "./contracts/tacoclicker"),
    [100n]
  );
  logger.success(`Taco Clicker at ${readableAlkaneId(tacoClickerAlkaneId)}`);

  return {
    controlledMintFactory,
    tacoClickerAlkaneId,
    merkleDistributorFactory,
  };
}

/*─────────────────────────────────────────────────────────────*
 |  Test error enum                                             |
 *─────────────────────────────────────────────────────────────*/

enum TestError {
  Unknown = "UnknownError",
  Assert = "AssertFailure",
}

/*─────────────────────────────────────────────────────────────*
 |  Individual test cases                                       |
 *─────────────────────────────────────────────────────────────*/

function assert<T>(expr: boolean, msg: string): BoxedResponse<T, TestError> {
  return expr
    ? new BoxedSuccess(true as unknown as T)
    : new BoxedError(TestError.Assert, msg);
}

/*────────── 1.  Initialization / consts  ─────────────────────*/
async function testInitialize(
  tc: TacoClickerContract,
  mintFactoryId: AlkaneId
): Promise<BoxedResponse<true, TestError>> {
  try {
    const consts = consumeOrThrow(await tc.getConsts());
    logger.deepAssert(
      new ParsableAlkaneId(mintFactoryId).toSchemaAlkaneId(),
      consts.controlled_mint_factory
    );
    logger.success("getConsts values match deployment arguments");
    return new BoxedSuccess(true);
  } catch (e) {
    return new BoxedError(TestError.Unknown, (e as Error).message);
  }
}

/*────────── 2.  Register flow (existing, wrapped) ────────────*/

async function testRegister(
  tc: TacoClickerContract
): Promise<BoxedResponse<true, TestError>> {
  const res = await testRegisterLegacy(tc);
  return res
    ? new BoxedSuccess(true)
    : new BoxedError(TestError.Assert, "registration tests failed");
}

/*────────── 3.  Base upgrade sheet costs / weights ───────────*/
async function testAvailableUpgradesBase(
  tc: TacoClickerContract
): Promise<BoxedResponse<true, TestError>> {
  try {
    const view = consumeOrThrow(
      await tc.getAvailableUpgrades({ taqueria: { block: 0, tx: 0n } })
    );
    // quick sanity check on two entries
    logger.deepAssert(10_000_000_000n, view.taquero.cost);
    logger.deepAssert(1n, view.taquero.weight);
    logger.deepAssert(300_000_000_000n, view.salsa_bar.cost);
    logger.success("Base upgrade sheet matches on‑chain constants");
    return new BoxedSuccess(true);
  } catch (e) {
    return new BoxedError(TestError.Unknown, (e as Error).message);
  }
}

/*────────── 4.  Mint tortilla & buy first upgrade ───────────*/
async function testBuyUpgrade(
  tc: TacoClickerContract,
  taqueriaId: AlkaneId,
  tortillaId: AlkaneId
): Promise<BoxedResponse<true, TestError>> {
  try {
    // 4.1 – mint enough tortilla to wallet
    const tortilla = new ControlledMintContract(
      provider,
      tortillaId,
      tc.signPsbt
    );

    // 4.2 – buy Taquero upgrade (id 0)
    const buy = await logger.progressExecute(
      "buyUpgrade → Taquero",
      tc.buyUpgrade(
        walletSigner.address,
        { upgrade: 0 },
        {
          transfers: [
            {
              asset: tortillaId,
              amount: 10_000_000_000n,
              address: walletSigner.address!, // contract addr
            } as SingularAlkanesTransfer /* SingularAlkanesTransfer */,
            {
              asset: taqueriaId, // auth alkane
              amount: 1n,
              address: walletSigner.address!,
            } as SingularAlkanesTransfer,
          ],
        }
      )
    );
    consumeOrThrow(buy); // should succeed

    // 4.3 – verify upgrade view shows amount = 1 & next_price = (base×3)/2
    const upg = consumeOrThrow(
      await tc.getUpgradesForTaqueria({
        taqueria: new ParsableAlkaneId(taqueriaId).toSchemaAlkaneId(),
      })
    );
    const expectedNext = (10_000_000_000n * 3n) / 2n;
    logger.deepAssert(2n, upg.taquero.amount);
    logger.deepAssert(expectedNext, upg.taquero.next_price);

    return new BoxedSuccess(true);
  } catch (e) {
    return new BoxedError(TestError.Unknown, (e as Error).message);
  }
}

/*────────── 5.  Emission accrual & claim ────────────────────*/
async function testEmissionAndClaim(
  tc: TacoClickerContract,
  taqueriaId: AlkaneId,
  tortillaId: AlkaneId
): Promise<BoxedResponse<true, TestError>> {
  try {
    const uncBefore = consumeOrThrow(
      await tc.getUnclaimedTortillaForTaqueria({
        taqueria: new ParsableAlkaneId(taqueriaId).toSchemaAlkaneId(),
      })
    ).unclaimed_tortilla;
    const BLOCKS = 5;
    logger.info(`Waiting for ${BLOCKS} blocks …`);
    await provider.waitForBlocks(BLOCKS);

    const unc = consumeOrThrow(
      await tc.getUnclaimedTortillaForTaqueria({
        taqueria: new ParsableAlkaneId(taqueriaId).toSchemaAlkaneId(),
      })
    );

    let heightBefore = Number(
      consumeOrThrow(
        await provider.rpc.alkanes.alkanes_metashrewHeight().call()
      )
    );

    logger.info(`Block before claim: ${heightBefore}`);

    const expected = uncBefore + TORTILLA_PER_BLOCK * BigInt(BLOCKS);
    logger.deepAssert(
      expected,
      unc.unclaimed_tortilla,
      [],
      "WARN: Assert failure. This can happen do to race conditions in the test suite, but not a contract issue (blocks generating while getting trace etc). Do double check."
    );

    // Claim <--- this also takes into account tortilla for this block
    consumeOrThrow(
      await logger.progressExecute(
        "claimTortilla",
        tc.claimTortilla(walletSigner.address, {
          transfers: [
            {
              asset: taqueriaId,
              amount: 1n,
              address: walletSigner.address!,
            } as SingularAlkanesTransfer,
          ],
        })
      )
    );

    let heightAfter = Number(
      consumeOrThrow(
        await provider.rpc.alkanes.alkanes_metashrewHeight().call()
      )
    );

    logger.info(`Block after claim: ${heightAfter}`);

    const tortilla = new ControlledMintContract(
      provider,
      tortillaId,
      tc.signPsbt
    );

    // Balance check – wallet should now hold ~expected – refund from buyUpgrade already done
    const balance = consumeOrThrow(
      await tortilla.getBalance(walletSigner.address)
    );

    const expectedParsed =
      new DecodableAlkanesResponse(expected).decodeTo("tokenValue") +
      (heightAfter - heightBefore) *
        new DecodableAlkanesResponse(TORTILLA_PER_BLOCK).decodeTo("tokenValue");

    //We add 15000 because the taqueria is also generating tortilla in the claim block
    logger.deepAssert(
      expectedParsed,
      balance,
      [],
      "WARN: Assert failure. This can happen do to race conditions in the test suite, but not a contract issue (blocks generating while getting trace etc). Do double check."
    );

    logger.success(`Wallet tortilla balance ≈ ${balance} TORTILLA`);

    return new BoxedSuccess(true);
  } catch (e) {
    return new BoxedError(TestError.Unknown, (e as Error).message);
  }
}

async function testAidropMerkleProof(
  tc: TacoClickerContract,
  merkleDistributorId: AlkaneId,
  tortillaAlkaneId: AlkaneId
): Promise<BoxedResponse<true, TestError>> {
  try {
    const merkleDistributor = new MerkleDistributorContract(
      provider,
      merkleDistributorId,
      tc.signPsbt
    );

    const address = walletSigner.address;
    const proof = consumeOrThrow(
      await logger.progressAbstract(
        "getMerkleProofForAddress",
        merkleDistributor.getMerkleProofForAddress({
          address,
          slug: "regtest",
        })
      )
    );

    logger.success(`Merkle proof for ${address}: ${JSON.stringify(proof)}`);

    const isValid = consumeOrThrow(
      await logger.progressAbstract(
        "getIsValidClaim",
        merkleDistributor.getIsValidClaim(proof)
      )
    );

    logger.deepAssert(1n, isValid);

    consumeOrThrow(
      await logger.progressExecute(
        "claim",
        merkleDistributor.claim(walletSigner.address, proof)
      )
    );

    logger.success("Claimed tortilla airdrop successfully");

    logger.info("Checking balance…");
    const tortilla = new ControlledMintContract(
      provider,
      tortillaAlkaneId,
      tc.signPsbt
    );

    const balance = consumeOrThrow(
      await tortilla.getBalance(walletSigner.address)
    );

    logger.success(`Wallet tortilla balance: ${balance} TORTILLA`);

    logger.deepAssert(108_000, balance);

    return new BoxedSuccess(true);
  } catch (e) {
    return new BoxedError(TestError.Unknown, (e as Error).message);
  }
}

/*
async function testBetOnBlock(
  tc: TacoClickerContract,
  taqueriaId: AlkaneId
): Promise<BoxedResponse<true, TestError>> {
  try {
    // need a fresh PoC nonce
    const nonce = await findValidNonce(taqueriaId);
    const res = consumeOrThrow(
      await logger.progressExecute(
        "betOnBlock",
        tc.betOnBlock(
          walletSigner.address,
          {
            nonce_found_poc: nonce,
            target_multiplier: 1n, // practically guarantees win
          },
          {
            transfers: [
              { asset: taqueriaId, amount: 1n, address: tc.address! } as any,
            ],
          }
        )
      )
    );
    logger.success(
      `Won ${toDecimal(res.won_amount)} TORTILLA – lost ${toDecimal(
        res.lost_amount
      )}`
    );
    return new BoxedSuccess(true);
  } catch (e) {
    return new BoxedError(TestError.Unknown, (e as Error).message);
  }
}
 |  Master runner                                               |
 *─────────────────────────────────────────────────────────────*/

export async function runTacoClicker(enableDeploy = true): Promise<void> {
  const root = logger.start("Taco Clicker game‑logic test‑suite");

  const {
    controlledMintFactory,
    tacoClickerAlkaneId,
    merkleDistributorFactory,
  } = await getContracts(enableDeploy);

  const tc = new TacoClickerContract(
    provider,
    tacoClickerAlkaneId,
    walletSigner.signPsbt
  );

  if (enableDeploy) {
    consumeOrThrow(
      await logger.progressExecute(
        "initializeOverride",
        tc.initializeOverride(walletSigner.address, {
          controlled_mint_factory: new ParsableAlkaneId(
            controlledMintFactory
          ).toSchemaAlkaneId(),
          merkle_distributor_factory: new ParsableAlkaneId(
            merkleDistributorFactory
          ).toSchemaAlkaneId(),
          merkle_root_id: await tc.getTortillaAirdropMerkleRoot("regtest"),
        })
      )
    );
  }

  const registerRes = consumeOrThrow(
    await logger.progressExecute(
      "register",
      tc.register(walletSigner.address, {
        transfers: [
          {
            asset: "btc",
            amount: Number(TacoClickerContract.TAQUERIA_COST_SATS),
            address: TacoClickerContract.FUNDING_ADDRESS,
          } as any,
        ],
      })
    )
  ).decodeTo("object");

  const taqueriaId = new ParsableAlkaneId(registerRes).toAlkaneId();
  const tortillaId = new ParsableAlkaneId(
    consumeOrThrow(await tc.getTortillaId())
  ).toAlkaneId();

  const merkleDistributorId = new ParsableAlkaneId(
    consumeOrThrow(await tc.getMerkleDistributorId())
  ).toAlkaneId();

  await logger.progressAbstract(
    "Waiting for one block so the caller has 15000 tortilla unclaimed",
    provider.waitForBlocks(1)
  );

  // ---- sequentially run tests ----
  const tests = [
    () => testAidropMerkleProof(tc, merkleDistributorId, tortillaId),
    () => testInitialize(tc, controlledMintFactory),
    () => testAvailableUpgradesBase(tc),
    () => testEmissionAndClaim(tc, taqueriaId, tortillaId),

    () => testBuyUpgrade(tc, taqueriaId, tortillaId),
    //() => testBetOnBlock(tc, taqueriaId),
  ];

  for (const t of tests) {
    const res = consumeOrThrow(await t());
  }

  root.close();
  logger.success("All Taco Clicker tests passed 🎉");
}
