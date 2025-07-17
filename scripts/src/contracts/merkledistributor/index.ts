/*
    #[opcode(105)]
    GetIsValidClaim,

    #[opcode(106)]
    Claim,

    #[opcode(107)]
    GetInitializationParams,
    */
import {
  abi,
  TokenABI,
  AlkanesBaseContract,
  AlkanesSimulationError,
} from "tacoclicker-sdk";
import {
  IMerkleProof,
  IMerkleTree,
  schemaInitializeMerkleDistributorParameters,
  schemaMerkleProof,
} from "./schemas";
import {
  BoxedError,
  BoxedResponse,
  BoxedSuccess,
  consumeOrThrow,
} from "@/boxed";

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
  overrideInitialize: abi
    .opcode(0n)
    .execute(schemaInitializeMerkleDistributorParameters)
    .returns("uint8Array"),

  getIsValidClaim: abi.opcode(105n).view(schemaMerkleProof).returns("bigint"),
  claim: abi
    .opcode(106n)
    .execute(undefined, schemaMerkleProof)
    .returns("uint8Array"),

  getInitializationParams: abi
    .opcode(107n)
    .view()
    .returns(schemaInitializeMerkleDistributorParameters),

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
        leaf: Array.from(Buffer.from(leaf, "hex")),
        proofs: proofs.map((p) => Array.from(Buffer.from(p, "hex"))),
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
export class MerkleDistributorContract extends abi.attach(
  AlkanesBaseContract,
  MerkleDistributorABI
) {}
