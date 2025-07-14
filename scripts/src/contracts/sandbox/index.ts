import { AlkanesBaseContract, TokenABI, abi } from "tacoclicker-sdk";
import { schemaWordCountRequest, schemaWordCountResponse } from "./schemas";

const SandboxABI = TokenABI.extend({
  wordCount: abi.opcode(106n).view(schemaWordCountRequest).returns(schemaWordCountResponse),
});

export class SandboxContract extends abi.attach(AlkanesBaseContract, SandboxABI) {}
