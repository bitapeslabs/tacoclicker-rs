import { AlkanesBaseContract, TokenABI, abi } from "tacoclicker-sdk";
import { schemaWordCountRequest, schemaWordCountResponse, schemaInscribeWordCountRequest } from "./schemas";

const SandboxABI = TokenABI.extend({
  wordCount: abi
    .opcode(106n)
    .execute(schemaWordCountRequest, schemaInscribeWordCountRequest)
    .returns(schemaWordCountResponse),
});

export class SandboxContract extends abi.attach(AlkanesBaseContract, SandboxABI) {}
