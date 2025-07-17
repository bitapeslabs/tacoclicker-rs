import { BorshSchema, Infer as BorshInfer } from "borsher";
import { schemaAlkaneId } from "tacoclicker-sdk";

export const schemaInitializeMerkleDistributorParameters = BorshSchema.Struct({
  merkle_root: BorshSchema.Vec(BorshSchema.u8),
  alkane_id: schemaAlkaneId,
  amount: BorshSchema.u128,
  block_end: BorshSchema.u64,
});

export const schemaMerkleProof = BorshSchema.Struct({
  leaf: BorshSchema.Vec(BorshSchema.u8),
  proofs: BorshSchema.Vec(BorshSchema.Vec(BorshSchema.u8)),
});

export const schemaMerkleLeaf = BorshSchema.Struct({
  address: BorshSchema.String,
  amount: BorshSchema.u128,
});

export type IMerkleLeaf = BorshInfer<typeof schemaMerkleLeaf>;
export type IMerkleProof = BorshInfer<typeof schemaMerkleProof>;
export type IInitializeMerkleDistributorParameters = BorshInfer<
  typeof schemaInitializeMerkleDistributorParameters
>;
export type IMerkleTree = Record<string, { leaf: string; proofs: string[] }>;
