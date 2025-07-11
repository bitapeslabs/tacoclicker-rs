import { field } from "@dao-xyz/borsh";

export class SchemaAlkaneId {
  @field({ type: "u32" })
  block!: number;

  @field({ type: "u64" })
  tx!: number;

  constructor(args: { block: number; tx: number }) {
    Object.assign(this, args);
  }
}

export class SchemaTortillaConsts {
  @field({ type: SchemaAlkaneId })
  taqueria_factory_alkane_id!: SchemaAlkaneId;

  @field({ type: SchemaAlkaneId })
  salsa_alkane_id!: SchemaAlkaneId;

  constructor(args: {
    taqueria_factory_alkane_id: SchemaAlkaneId;
    salsa_alkane_id: SchemaAlkaneId;
  }) {
    Object.assign(this, args);
  }
}
