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
import { AlkanesBaseContract } from "./base";
import { AlkanesSimulationError } from "./base";
import { AlkanesExecuteError } from "../alkanes";

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
  async initialize(
    address: string,
    params: {
      token_units?: bigint;
      value_per_mint?: bigint;
      cap?: bigint;
      name: string;
      symbol: string;
    }
  ): Promise<BoxedResponse<boolean, AlkanesExecuteError>> {
    try {
      let paramSchema = z.object({
        token_units: u128Schema.optional(),
        value_per_mint: u128Schema.optional(),
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

      let callData: bigint[] = [
        0n, // opcode for Initialize
        parsedParams.data.token_units ?? 0n,
        parsedParams.data.value_per_mint ?? 0n,
        parsedParams.data.cap ?? 0n,
        ...nameEncoded,
        ...symbolEncoded,
      ];

      consumeOrThrow(
        await this.pushExecute({
          address,
          callData,
        })
      );

      return new BoxedSuccess(true);
    } catch (error) {
      return new BoxedError(
        AlkanesExecuteError.UnknownError,
        "Execution failed: " + (error as Error).message
      );
    }
  }

  async mintTokens(
    address: string,
    params: { amount?: bigint }
  ): Promise<BoxedResponse<boolean, AlkanesExecuteError>> {
    try {
      let paramSchema = z.object({
        amount: u128Schema.optional(),
      });

      const parsedParams = paramSchema.safeParse(params);
      if (!parsedParams.success) {
        return new BoxedError(
          AlkanesExecuteError.InvalidParams,
          "Invalid parameters: " + parsedParams.error.message
        );
      }

      let callData: bigint[] = [77n]; // opcode for MintTokens
      if (parsedParams.data.amount !== undefined) {
        callData.push(parsedParams.data.amount);
      }

      consumeOrThrow(
        await this.pushExecute({
          address,
          callData,
        })
      );

      return new BoxedSuccess(true);
    } catch (error) {
      return new BoxedError(
        AlkanesExecuteError.UnknownError,
        "Execution failed: " + (error as Error).message
      );
    }
  }
  async viewGetName(): Promise<BoxedResponse<string, AlkanesSimulationError>> {
    try {
      let callData: bigint[] = [99n]; // opcode for GetName
      let simulationResult = consumeOrThrow(
        await this.simulate({
          callData,
          target: this.alkaneId,
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
      let callData: bigint[] = [100n]; // opcode for GetSymbol
      let simulationResult = consumeOrThrow(
        await this.simulate({
          callData,
          target: this.alkaneId,
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
      let callData: bigint[] = [101n];
      let simulationResult = consumeOrThrow(
        await this.simulate({
          callData,
          target: this.alkaneId,
        })
      );

      return new BoxedSuccess(
        new DecodableAlkanesResponse(simulationResult).toTokenValue(8)
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
      let callData: bigint[] = [102n]; // opcode for GetCap
      let simulationResult = consumeOrThrow(
        await this.simulate({
          callData,
          target: this.alkaneId,
        })
      );

      return new BoxedSuccess(
        new DecodableAlkanesResponse(simulationResult).toTokenValue(8)
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
      let callData: bigint[] = [103n]; // opcode for GetMinted
      let simulationResult = consumeOrThrow(
        await this.simulate({
          callData,
          target: this.alkaneId,
        })
      );

      return new BoxedSuccess(
        new DecodableAlkanesResponse(simulationResult).toTokenValue(8)
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
      let callData: bigint[] = [104n]; // opcode for GetValuePerMint
      let simulationResult = consumeOrThrow(
        await this.simulate({
          callData,
          target: this.alkaneId,
        })
      );

      return new BoxedSuccess(
        new DecodableAlkanesResponse(simulationResult).toTokenValue(8)
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
      let callData: bigint[] = [1000n]; // opcode for GetData
      let simulationResult = consumeOrThrow(
        await this.simulate({
          callData,
          target: this.alkaneId,
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
}
