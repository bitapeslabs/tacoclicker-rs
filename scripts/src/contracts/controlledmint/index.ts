import { abi, schemaAlkaneId, TokenABI, AlkanesBaseContract } from "tacoclicker-sdk";

const ControlledMintABI = TokenABI.extend({
  getOwner: abi.opcode(105n).view().returns(schemaAlkaneId),

  //this is supposed to fail because it can only be called by a contract. The point of the def is to ensure the failure on our tests
  mintExact: abi.opcode(106n).execute("bigint").returns(),
});

export class ControlledMintContract extends abi.attach(AlkanesBaseContract, ControlledMintABI) {}
