import { BoxedResponse, BoxedSuccess, BoxedError, consumeOrThrow } from "@/boxed";
import { z } from "zod";
import { abi } from "./builder"; // ⟵ adjust the import if the helper lives elsewhere
import { AlkanesBaseContract, AlkanesSimulationError } from "./base";

import { Encodable } from "../encoders";
import { AlkanesExecuteError } from "../alkanes";
import { AlkanesFetchError } from "@/apis";
import { DecodableAlkanesResponse } from "../decoders";
const DECIMALS = 8n;

const paramSchema = z.object({
  premine: z.bigint().optional(),
  valuePerMint: z.bigint().optional(),
  cap: z.bigint().optional(),
  name: z.string(),
  symbol: z.string(),
});

type ITokenParamsSchema = z.infer<typeof paramSchema>;

export const TokenABI = abi.contract({
  initialize: abi.opcode(0n).custom(async function (
    this,
    opcode,
    params: { address: string; tokenParams: ITokenParamsSchema },
  ) {
    const parsed = paramSchema.safeParse(params.tokenParams);
    if (!parsed.success) {
      return new BoxedError(AlkanesExecuteError.InvalidParams, `Invalid parameters: ${parsed.error.message}`);
    }

    const nameEncoded = consumeOrThrow(new Encodable(parsed.data.name).encodeFrom("name"));
    const symbolEncoded = consumeOrThrow(new Encodable(parsed.data.symbol).encodeFrom("char"));

    const premine = (parsed.data.premine ?? 0n) * 10n ** DECIMALS;
    const valuePerMint = (parsed.data.valuePerMint ?? 0n) * 10n ** DECIMALS;

    const callData: bigint[] = [
      opcode, // Initialize opcode
      premine,
      valuePerMint,
      parsed.data.cap ?? 0n,
      ...nameEncoded,
      ...symbolEncoded,
    ];

    const res = consumeOrThrow(await this.pushExecute({ address: params.address, callData }));
    return new BoxedSuccess(res);
  }),

  mintTokens: abi.opcode(77n).execute().returns("uint8Array"),

  getName: abi.opcode(99n).view().returns("string"),

  getSymbol: abi.opcode(100n).view().returns("string"),

  getTotalSupply: abi.opcode(101n).view().returns("tokenValue"),

  getCap: abi.opcode(102n).view().returns("bigint"),

  getMinted: abi.opcode(103n).view().returns("bigint"),

  getValuePerMint: abi.opcode(104n).view().returns("tokenValue"),

  getData: abi.opcode(1000n).view().returns("uint8Array"),

  getBalance: abi
    .opcode(1002n) // dummy opcode — never hits the WASM
    .custom(async function (this, opcode, address: string) {
      try {
        const outpoints = consumeOrThrow(
          await this.provider.rpc.alkanes.alkanes_getAlkanesByAddress(address),
        ).outpoints;
        const target = `${this.alkaneId.block.toString()}:${this.alkaneId.tx.toString()}`;
        const balance = outpoints.reduce((acc, op) => {
          const val = BigInt(
            op.runes.find((e: any) => `${BigInt(e.rune.id.block)}:${BigInt(e.rune.id.tx)}` === target)?.balance ?? "0",
          );
          return acc + val;
        }, 0n);
        return new BoxedSuccess(new DecodableAlkanesResponse(balance).decodeTo("tokenValue"));
      } catch (err) {
        return new BoxedError(AlkanesFetchError.UnknownError, `Failed to fetch balance: ${(err as Error).message}`);
      }
    }),
});

export class TokenContract extends abi.attach(AlkanesBaseContract, TokenABI) {}
