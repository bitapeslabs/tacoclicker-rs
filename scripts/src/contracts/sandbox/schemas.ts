import { BorshSchema, Infer as BorshInfer } from "borsher";

export const schemaWordCountRequest = BorshSchema.Struct({
  data: BorshSchema.String,
});

export const schemaInscribeWordCountRequest = BorshSchema.Struct({
  inscribe: BorshSchema.String,
});

export type IWordCountRequest = BorshInfer<typeof schemaWordCountRequest>;

export const schemaWordCountResponse = BorshSchema.Struct({
  calldata_echo: BorshSchema.String,
  inscribe_echo: BorshSchema.String,
  calldata_count: BorshSchema.u16,
  inscribe_count: BorshSchema.u16,
});

export type IWordCountResponse = BorshInfer<typeof schemaWordCountResponse>;
