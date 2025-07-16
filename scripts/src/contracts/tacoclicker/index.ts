import { abi, TokenABI, AlkanesBaseContract } from "tacoclicker-sdk";
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
} from "./schemas";
import { schemaAlkaneId } from "tacoclicker-sdk";

const TacoClickerABI = TokenABI.extend({
  getConsts: abi.opcode(105n).view().returns("uint8Array"),

  register: abi.opcode(106n).execute().returns("uint8Array"),

  getTaqueriaFromAlkaneList: abi
    .opcode(107n)
    .execute(schemaAlkaneList)
    .returns(schemaAlkaneList),
  getTortillaId: abi.opcode(108n).view().returns(schemaAlkaneId),

  getTortillaPerBlockForTaqueria: abi
    .opcode(110n)
    .execute(schemaTaqueriaParam)
    .returns(schemaTortillaPerBlockRes),

  getUnclaimedTortillaForTaqueria: abi
    .opcode(111n)
    .execute(schemaTaqueriaParam)
    .returns(schemaUnclaimedRes),

  getUpgradesForTaqueria: abi
    .opcode(112n)
    .execute(schemaTaqueriaParam)
    .returns(schemaUserUpgradesView),

  getAvailableUpgrades: abi
    .opcode(113n)
    .execute(schemaTaqueriaParam)
    .returns(schemaUpgradesView),

  getMultiplierFromHash: abi
    .opcode(114n)
    .execute(schemaGetMulReq)
    .returns(schemaGetMulRes),

  buyUpgrade: abi.opcode(115n).execute(schemaBuyUpgradeReq),

  betOnBlock: abi
    .opcode(116n)
    .execute(schemaBetOnBlockReq)
    .returns(schemaBetOnBlockRes),

  claimTortilla: abi.opcode(117n).execute(),
});

export class TacoClickerContract extends abi.attach(
  AlkanesBaseContract,
  TacoClickerABI
) {}
