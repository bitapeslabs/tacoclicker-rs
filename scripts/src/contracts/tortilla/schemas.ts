import { BorshSchema, Infer as BorshInfer } from "borsher";
import { schemaAlkaneId } from "tacoclicker-sdk";

export const schemaAlkaneList = BorshSchema.Struct({
  alkanes: BorshSchema.Vec(schemaAlkaneId),
});

export const schemaTortillaConsts = BorshSchema.Struct({
  taqueria_factory_alkane_id: schemaAlkaneId,
  salsa_alkane_id: schemaAlkaneId,
});

export type ISchemaAlkaneList = BorshInfer<typeof schemaAlkaneList>;
export type ISchemaTortillaConsts = BorshInfer<typeof schemaTortillaConsts>;
