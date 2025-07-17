import {
  abi,
  TokenABI,
  AlkanesBaseContract,
  schemaAlkaneId,
  Encodable,
  DecodableAlkanesResponse,
  AlkanesExecuteError,
  AlkanesSimulationError,
  Provider,
  AlkaneId,
} from "tacoclicker-sdk";
import {
  schemaTaqueriaParam,
  schemaAlkaneList,
  schemaTortillaPerBlockRes,
  schemaUnclaimedRes,
  schemaUserUpgradesView,
  schemaUpgradesEntry,
  schemaUpgradesView,
  schemaGetMulReq,
  schemaGetMulRes,
  schemaBuyUpgradeReq,
  schemaBetOnBlockReq,
  schemaBetOnBlockRes,
  schemaTacoClickerInitializeParams,
  schemaTacoClickerConsts,
  schemaGlobalState,
  schemaTaqueriaEmissionState,
  IMerkleTree,
  schemaMerkleProof,
  IMerkleProof,
} from "./schemas";

import { Infer as BorshInfer } from "borsher";

import {
  BoxedSuccess,
  BoxedError,
  BoxedResponse,
  consumeOrThrow,
} from "@/boxed";
import chalk from "chalk";
import { ControlledMintContract } from "../controlledmint";

const strip0x = (h: string) => (h.startsWith("0x") ? h.slice(2) : h);

enum FetchError {
  UnknownError = "UnknownError",
}

const MERKLE_TREE_GITHUB_URL =
  "https://raw.githubusercontent.com/bitapeslabs/tacoclicker-airdrop/refs/heads/main";

async function getMerkleTree(
  slug: "mainnet" | "regtest"
): Promise<BoxedResponse<IMerkleTree, FetchError>> {
  try {
    const url = `${MERKLE_TREE_GITHUB_URL}/tortilla-airdrop-${slug}.json`;

    const res = await fetch(url);

    if (!res.ok) {
      return new BoxedError(
        FetchError.UnknownError,
        `Failed to fetch Merkle tree from ${url}: ${res.statusText}`
      );
    }

    const json = await res.json();

    // Return the root as a hex string
    return new BoxedSuccess(json as IMerkleTree);
  } catch (e) {
    return new BoxedError(
      FetchError.UnknownError,
      `Failed to fetch Merkle tree: ${
        e instanceof Error ? e.message : String(e)
      }`
    );
  }
}

const MerkleDistributorABI = TokenABI.extend({
  getIsValidAirdropClaim: abi
    .opcode(120n)
    .view(schemaMerkleProof)
    .returns("bigint"),
  claimAirdrop: abi
    .opcode(121n)
    .execute(undefined, schemaMerkleProof)
    .returns("uint8Array"),

  getMerkleProofForAddress: abi.opcode(999n).custom(async function (
    this: AlkanesBaseContract,
    opcode,
    params: {
      address: string;
      slug?: "mainnet" | "regtest";
    }
  ) {
    try {
      let merkleTree = consumeOrThrow(
        await getMerkleTree(params.slug ?? "regtest")
      );

      if (!merkleTree[params.address]) {
        return new BoxedError(
          AlkanesSimulationError.UnknownError,
          `No Merkle proof found for address ${params.address}`
        );
      }

      const { leaf, proofs } = merkleTree[params.address];
      const proof: IMerkleProof = {
        leaf: Array.from(Buffer.from(strip0x(leaf), "hex")),
        proofs: proofs.map((p) => Array.from(Buffer.from(strip0x(p), "hex"))),
      };

      return new BoxedSuccess(proof);
    } catch (e) {
      return new BoxedError(
        AlkanesSimulationError.UnknownError,
        `Failed to fetch Merkle tree: ${
          e instanceof Error ? e.message : String(e)
        }`
      );
    }
  }),
});

const TacoClickerABI = MerkleDistributorABI.extend({
  initializeOverride: abi
    .opcode(0n)
    .execute(schemaTacoClickerInitializeParams)
    .returns("uint8Array"),

  getConsts: abi.opcode(105n).view().returns(schemaTacoClickerConsts),

  getTaqueriaEmissionState: abi
    .opcode(106n)
    .view(schemaTaqueriaParam)
    .returns(schemaTaqueriaEmissionState),

  getTaqueriaFromAlkaneList: abi
    .opcode(107n)
    .view(schemaAlkaneList)
    .returns(schemaAlkaneList),
  getTortillaId: abi.opcode(108n).view().returns(schemaAlkaneId),

  getTortillaPerBlockForTaqueria: abi
    .opcode(110n)
    .view(schemaTaqueriaParam)
    .returns(schemaTortillaPerBlockRes),

  getUnclaimedTortillaForTaqueria: abi
    .opcode(111n)
    .view(schemaTaqueriaParam)
    .returns(schemaUnclaimedRes),

  getUpgradesForTaqueria: abi
    .opcode(112n)
    .view(schemaTaqueriaParam)
    .returns(schemaUserUpgradesView),

  getAvailableUpgrades: abi
    .opcode(113n)
    .view(schemaTaqueriaParam)
    .returns(schemaUpgradesView),

  getMultiplierFromHash: abi
    .opcode(114n)
    .view(schemaGetMulReq)
    .returns(schemaGetMulRes),

  getGlobalCompleteState: abi
    .opcode(115n)
    .view(schemaTaqueriaParam)
    .returns(schemaGlobalState),

  buyUpgrade: abi
    .opcode(116n)
    .execute(schemaBuyUpgradeReq)
    .returns("uint8Array"),

  betOnBlock: abi
    .opcode(117n)
    .execute(schemaBetOnBlockReq)
    .returns(schemaBetOnBlockRes),

  claimTortilla: abi.opcode(118n).execute().returns("uint8Array"),

  register: abi.opcode(119n).execute().returns(schemaAlkaneId),

  getTortillaAirdropMerkleRoot: abi
    .opcode(999n)
    .custom(async function (
      this: AlkanesBaseContract,
      opcode: bigint,
      slug?: "mainnet" | "regtest"
    ): Promise<number> {
      if (slug === "regtest") {
        return 0;
      }
      return 1;
    }),
});

export class TacoClickerContract extends abi.attach(
  AlkanesBaseContract,
  TacoClickerABI
) {
  public static readonly FUNDING_ADDRESS =
    "bcrt1pluksgqq4kf0kwu3unj00p4mla3xk7tq5ay49wnewt8eydmq22mhsn4qdaw";

  public static readonly TAQUERIA_COST_SATS = 21_000n;

  public provider: Provider;

  constructor(
    provider: Provider,
    alkaneId: AlkaneId,
    signPsbt: (psbt: string) => Promise<string>
  ) {
    super(provider, alkaneId, signPsbt);
    this.provider = provider;
  }

  public async getTaqueriasForAddress(
    address: string
  ): Promise<
    BoxedResponse<BorshInfer<typeof schemaAlkaneId>[], AlkanesExecuteError>
  > {
    try {
      const { outpoints } = consumeOrThrow(
        await this.provider.rpc.alkanes.alkanes_getAlkanesByAddress(address)
      );

      const set = new Set(
        outpoints.flatMap((op: any) =>
          op.runes.map(
            (r: any) => `${BigInt(r.rune.id.block)}:${BigInt(r.rune.id.tx)}`
          )
        )
      );

      const alkanes = Array.from(set).map((s) => {
        const [block, tx] = s.split(":");
        return { block: Number(block), tx: BigInt(tx) };
      });

      // simulate internal call to filter only registered taquerias
      const callData: bigint[] = [
        107n,
        ...consumeOrThrow(
          new Encodable({ alkanes }, schemaAlkaneList).encodeFrom("object")
        ),
      ];

      const sim = consumeOrThrow(await super.simulate({ callData }));
      const decoded = new DecodableAlkanesResponse(
        sim,
        schemaAlkaneList
      ).decodeTo("object");

      return new BoxedSuccess(decoded.alkanes);
    } catch (err) {
      return new BoxedError(
        AlkanesExecuteError.UnknownError,
        (err as Error).message
      );
    }
  }

  public async getTaqueriaContractForAddress(
    address: string
  ): Promise<BoxedResponse<ControlledMintContract, AlkanesSimulationError>> {
    try {
      const taqs = consumeOrThrow(await this.getTaqueriasForAddress(address));
      if (taqs.length === 0) {
        return new BoxedError(
          AlkanesSimulationError.UnknownError,
          "No taquerias found for this address"
        );
      }

      const [first] = taqs;

      const taqueria = new ControlledMintContract(
        this.provider,
        { block: BigInt(first.block), tx: BigInt(first.tx) },
        super.signPsbt
      );

      return new BoxedSuccess(taqueria);
    } catch (err) {
      console.log(chalk.red("viewGetTaqueria error:"), err);
      return new BoxedError(
        AlkanesSimulationError.UnknownError,
        (err as Error).message
      );
    }
  }
}
