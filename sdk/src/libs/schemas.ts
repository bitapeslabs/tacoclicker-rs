import { z } from "zod";
import { BorshSchema, Infer as BorshInfer } from "borsher";

// 2^128 − 1  (all bits set in a 128-bit register)
const MAX_U128 = (1n << 128n) - 1n;

/**
 * Schema that accepts any bigint in the closed interval
 * [0, 2^128 - 1].  Throws a ZodError otherwise.
 */
export const u128Schema = z.bigint().refine((v) => v >= 0n && v <= MAX_U128, {
  message: "Value must be a valid unsigned 128-bit integer",
});

export const schemaAlkaneId = BorshSchema.Struct({
  block: BorshSchema.u32,
  tx: BorshSchema.u64,
});

export type ISchemaAlkaneId = BorshInfer<typeof schemaAlkaneId>;
