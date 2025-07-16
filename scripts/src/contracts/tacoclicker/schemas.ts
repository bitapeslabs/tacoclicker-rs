import { schemaAlkaneId } from "tacoclicker-sdk";
import { BorshSchema, Infer as BorshInfer } from "borsher";

export const schemaTacoClickerConsts = BorshSchema.Struct({
  controlled_mint_factory: schemaAlkaneId,
  tortilla_alkane_id: schemaAlkaneId,
});

export type IAlkaneId = BorshInfer<typeof schemaAlkaneId>;

export const schemaTaqueriaParam = BorshSchema.Struct({
  taqueria: schemaAlkaneId,
});
export type ITaqueriaParam = BorshInfer<typeof schemaTaqueriaParam>;

/*────────────────────────────  Request / Response Schemas  ────────────────────*/

// 105  GetConsts → Vec<u8>  (opaque bytes)  – no additional TS schema needed.

// 106  Register            → Vec<u8>        – same, opaque.

// 107  GetTaqueriaFromAlkaneList
export const schemaAlkaneList = BorshSchema.Struct({
  alkanes: BorshSchema.Vec(schemaAlkaneId),
});
export type IAlkaneList = BorshInfer<typeof schemaAlkaneList>;

// 108  GetTortillaId       → SchemaAlkaneId  (reuse schemaAlkaneId)

// 110  GetTortillaPerBlockForTaqueria
export const schemaTortillaPerBlockRes = BorshSchema.Struct({
  tortilla_per_block: BorshSchema.u128,
});
export type ITortillaPerBlockRes = BorshInfer<typeof schemaTortillaPerBlockRes>;

// 111  GetUnclaimedTortillaForTaqueria
export const schemaUnclaimedRes = BorshSchema.Struct({
  unclaimed_tortilla: BorshSchema.u128,
});
export type IUnclaimedRes = BorshInfer<typeof schemaUnclaimedRes>;

// 112  GetUpgradesForTaqueria   → SchemaUserUpgradesView (big struct)
export const schemaUserUpgradesEntry = BorshSchema.Struct({
  amount: BorshSchema.u128,
  next_price: BorshSchema.u128,
});
export const schemaUserUpgradesView = BorshSchema.Struct({
  taquero: schemaUserUpgradesEntry,
  salsa_bar: schemaUserUpgradesEntry,
  tortilla_tree: schemaUserUpgradesEntry,
  tortilla_factory: schemaUserUpgradesEntry,
  taco_bank: schemaUserUpgradesEntry,
  taco_pyramid: schemaUserUpgradesEntry,
  tortilla_spaceship: schemaUserUpgradesEntry,
  satoshi_tacomoto: schemaUserUpgradesEntry,
});
export type IUserUpgradesView = BorshInfer<typeof schemaUserUpgradesView>;

// 113  GetAvailableUpgrades    → SchemaUpgradesView
export const schemaUpgradesEntry = BorshSchema.Struct({
  cost: BorshSchema.u128,
  weight: BorshSchema.u128,
  current_emission: BorshSchema.u128,
});
export const schemaUpgradesView = BorshSchema.Struct({
  taquero: schemaUpgradesEntry,
  salsa_bar: schemaUpgradesEntry,
  tortilla_tree: schemaUpgradesEntry,
  tortilla_factory: schemaUpgradesEntry,
  taco_bank: schemaUpgradesEntry,
  taco_pyramid: schemaUpgradesEntry,
  tortilla_spaceship: schemaUpgradesEntry,
  satoshi_tacomoto: schemaUpgradesEntry,
});
export type IUpgradesView = BorshInfer<typeof schemaUpgradesView>;

// 114  GetMultiplierFromHash
export const schemaGetMulReq = BorshSchema.Struct({
  hash_bytes_be: BorshSchema.Vec(BorshSchema.u8),
});
export const schemaGetMulRes = BorshSchema.Struct({
  multiplier: BorshSchema.u128,
});
export type IGetMulRes = BorshInfer<typeof schemaGetMulRes>;

// 115  BuyUpgrade
export const schemaBuyUpgradeReq = BorshSchema.Struct({
  upgrade: BorshSchema.u8, // UpgradeKind enum discriminant
});
// returns nothing (just a success flag in the CallResponse)

// 116  BetOnBlock
export const schemaBetOnBlockReq = BorshSchema.Struct({
  nonce_found_poc: BorshSchema.u128,
  target_multiplier: BorshSchema.u128,
});
export const schemaBetOnBlockRes = BorshSchema.Struct({
  won_amount: BorshSchema.u128,
  lost_amount: BorshSchema.u128,
});
