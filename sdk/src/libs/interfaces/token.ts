import {
  BoxedResponse,
  BoxedSuccess,
  BoxedError,
  consumeOrThrow,
} from "@/boxed";
import { z } from "zod";
import { u128Schema } from "../schemas";
import { DecodableAlkanesResponse } from "../decoders";
import { Encodable } from "../encoders";
import { AlkanesBaseContract, AlkanesPushExecuteResponse } from "./base";
import { AlkanesSimulationError } from "./base";
import { AlkanesExecuteError } from "../alkanes";
import { AlkanesFetchError } from "@/apis";

/*FOR REFRENCE: FREE MINT OP CODES
/// Initialize the token with configuration
    #[opcode(0)]
    Initialize {
        /// Initial token units
        token_units: u128,
        /// Value per mint
        value_per_mint: u128,
        /// Maximum supply cap (0 for unlimited)
        cap: u128,
        /// Token name part 1
        name_part1: u128,
        /// Token name part 2
        name_part2: u128,
        /// Token symbol
        symbol: u128,
    },

    /// Mint new tokens
    #[opcode(77)]
    MintTokens,

    /// Get the token name
    #[opcode(99)]
    #[returns(String)]
    GetName,

    /// Get the token symbol
    #[opcode(100)]
    #[returns(String)]
    GetSymbol,

    /// Get the total supply
    #[opcode(101)]
    #[returns(u128)]
    GetTotalSupply,

    /// Get the maximum supply cap
    #[opcode(102)]
    #[returns(u128)]
    GetCap,

    /// Get the total minted count
    #[opcode(103)]
    #[returns(u128)]
    GetMinted,

    /// Get the value per mint
    #[opcode(104)]
    #[returns(u128)]
    GetValuePerMint,

    /// Get the token data
    #[opcode(1000)]
    #[returns(Vec<u8>)]
    GetData,
*/

// All alkane tokens have divisibility of 8. Uints passed here are without the 8 decimal places

//Implements free_mint.wasm methods

export class BaseTokenContract extends AlkanesBaseContract {
  public get OpCodes() {
    return {
      Initialize: 0n,
      MintTokens: 77n,
      GetName: 99n,
      GetSymbol: 100n,
      GetTotalSupply: 101n,
      GetCap: 102n,
      GetMinted: 103n,
      GetValuePerMint: 104n,
      GetData: 1000n,
    } as const;
  }

  public get decimals(): number {
    return 8;
  }

  async initialize(
    address: string,
    params: {
      premine?: bigint;
      valuePerMint?: bigint;
      cap?: bigint;
      name: string;
      symbol: string;
    }
  ): Promise<BoxedResponse<AlkanesPushExecuteResponse, AlkanesExecuteError>> {
    try {
      let paramSchema = z.object({
        premine: u128Schema.optional(),
        valuePerMint: u128Schema.optional(),
        cap: u128Schema.optional(),
        name: z.string(),
        symbol: z.string(),
      });

      const parsedParams = paramSchema.safeParse(params);
      if (!parsedParams.success) {
        return new BoxedError(
          AlkanesExecuteError.InvalidParams,
          "Invalid parameters: " + parsedParams.error.message
        );
      }

      let nameEncoded = consumeOrThrow(
        new Encodable(parsedParams.data.name).fromName()
      );
      let symbolEncoded = consumeOrThrow(
        new Encodable(parsedParams.data.symbol).fromChar()
      );

      let premine =
        (parsedParams.data.premine ?? 0n) * 10n ** BigInt(this.decimals);

      let valuePerMint =
        (parsedParams.data.valuePerMint ?? 0n) * 10n ** BigInt(this.decimals);

      let callData: bigint[] = [
        this.OpCodes.Initialize, // opcode for Initialize
        premine,
        valuePerMint,
        parsedParams.data.cap ?? 0n,
        ...nameEncoded,
        ...symbolEncoded,
      ];

      let response = consumeOrThrow(
        await this.pushExecute({
          address,
          callData,
        })
      );

      return new BoxedSuccess(response);
    } catch (error) {
      return new BoxedError(
        AlkanesExecuteError.UnknownError,
        "Execution failed: " + (error as Error).message
      );
    }
  }

  async mintTokens(
    address: string
  ): Promise<BoxedResponse<AlkanesPushExecuteResponse, AlkanesExecuteError>> {
    try {
      let callData: bigint[] = [this.OpCodes.MintTokens]; // opcode for MintTokens

      let response = consumeOrThrow(
        await this.pushExecute({
          address,
          callData,
        })
      );

      return new BoxedSuccess(response);
    } catch (error) {
      return new BoxedError(
        AlkanesExecuteError.UnknownError,
        "Execution failed: " + (error as Error).message
      );
    }
  }
  async viewGetName(): Promise<BoxedResponse<string, AlkanesSimulationError>> {
    try {
      let callData: bigint[] = [this.OpCodes.GetName]; // opcode for GetName
      let simulationResult = consumeOrThrow(
        await this.simulate({
          callData,
        })
      );

      return new BoxedSuccess(
        new DecodableAlkanesResponse(simulationResult).toString()
      );
    } catch (error) {
      return new BoxedError(
        AlkanesSimulationError.UnknownError,
        "Simulation failed: " + (error as Error).message
      );
    }
  }

  async viewGetSymbol(): Promise<
    BoxedResponse<string, AlkanesSimulationError>
  > {
    try {
      let callData: bigint[] = [this.OpCodes.GetSymbol]; // opcode for GetSymbol
      let simulationResult = consumeOrThrow(
        await this.simulate({
          callData,
        })
      );

      return new BoxedSuccess(
        new DecodableAlkanesResponse(simulationResult).toString()
      );
    } catch (error) {
      return new BoxedError(
        AlkanesSimulationError.UnknownError,
        "Simulation failed: " + (error as Error).message
      );
    }
  }

  async viewGetTotalSupply(): Promise<
    BoxedResponse<number, AlkanesSimulationError>
  > {
    try {
      let callData: bigint[] = [this.OpCodes.GetTotalSupply];
      let simulationResult = consumeOrThrow(
        await this.simulate({
          callData,
        })
      );

      return new BoxedSuccess(
        new DecodableAlkanesResponse(simulationResult).toTokenValue(
          this.decimals
        )
      );
    } catch (error) {
      return new BoxedError(
        AlkanesSimulationError.UnknownError,
        "Simulation failed: " + (error as Error).message
      );
    }
  }

  async viewGetCap(): Promise<BoxedResponse<number, AlkanesSimulationError>> {
    try {
      let callData: bigint[] = [this.OpCodes.GetCap]; // opcode for GetCap
      let simulationResult = consumeOrThrow(
        await this.simulate({
          callData,
        })
      );

      return new BoxedSuccess(
        new DecodableAlkanesResponse(simulationResult).toTokenValue(0)
      );
    } catch (error) {
      return new BoxedError(
        AlkanesSimulationError.UnknownError,
        "Simulation failed: " + (error as Error).message
      );
    }
  }
  async viewGetMinted(): Promise<
    BoxedResponse<number, AlkanesSimulationError>
  > {
    try {
      let callData: bigint[] = [this.OpCodes.GetMinted]; // opcode for GetMinted
      let simulationResult = consumeOrThrow(
        await this.simulate({
          callData,
        })
      );

      return new BoxedSuccess(
        new DecodableAlkanesResponse(simulationResult).toTokenValue(0)
      );
    } catch (error) {
      return new BoxedError(
        AlkanesSimulationError.UnknownError,
        "Simulation failed: " + (error as Error).message
      );
    }
  }

  async viewGetValuePerMint(): Promise<
    BoxedResponse<number, AlkanesSimulationError>
  > {
    try {
      let callData: bigint[] = [this.OpCodes.GetValuePerMint]; // opcode for GetValuePerMint
      let simulationResult = consumeOrThrow(
        await this.simulate({
          callData,
        })
      );

      return new BoxedSuccess(
        new DecodableAlkanesResponse(simulationResult).toTokenValue(
          this.decimals
        )
      );
    } catch (error) {
      return new BoxedError(
        AlkanesSimulationError.UnknownError,
        "Simulation failed: " + (error as Error).message
      );
    }
  }

  async viewGetData(): Promise<
    BoxedResponse<Uint8Array, AlkanesSimulationError>
  > {
    try {
      let callData: bigint[] = [this.OpCodes.GetData]; // opcode for GetData
      let simulationResult = consumeOrThrow(
        await this.simulate({
          callData,
        })
      );

      return new BoxedSuccess(
        new DecodableAlkanesResponse(simulationResult).bytes
      );
    } catch (error) {
      return new BoxedError(
        AlkanesSimulationError.UnknownError,
        "Simulation failed: " + (error as Error).message
      );
    }
  }

  async viewGetBalance(
    address: string
  ): Promise<BoxedResponse<number, AlkanesFetchError>> {
    try {
      let outpoints = consumeOrThrow(
        await this.provider.rpc.alkanes.alkanes_getAlkanesByAddress(address)
      ).outpoints;

      let target = `${this.alkaneId.block.toString()}:${this.alkaneId.tx.toString()}`;

      let balance = outpoints.reduce((acc, outpoint) => {
        let value = BigInt(
          outpoint.runes.find(
            (alkaneEntry) =>
              `${BigInt(alkaneEntry.rune.id.block).toString()}:${BigInt(alkaneEntry.rune.id.tx).toString()}` ===
              target
          )?.balance ?? "0"
        );
        return acc + value;
      }, 0n);

      return new BoxedSuccess(
        new DecodableAlkanesResponse(balance).toTokenValue(this.decimals)
      );
    } catch (error) {
      return new BoxedError(
        AlkanesFetchError.UnknownError,
        "Failed to fetch balance: " + (error as Error).message
      );
    }
  }
}
