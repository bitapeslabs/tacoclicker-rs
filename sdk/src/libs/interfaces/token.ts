/* libs/interfaces/index.ts
   --------------------------------------------------------------- */
import {
  BoxedResponse,
  isBoxedError,
  BoxedSuccess,
  BoxedError,
  consumeOrThrow,
} from "@/boxed";
import { AlkaneId, AlkanesTraceResult } from "@/apis";
import { Provider } from "@/provider";
import { Psbt } from "bitcoinjs-lib";
import { AlkanesTraceError } from "@/apis";
import { hexToUint8Array, sleep } from "@/utils";
import { z } from "zod";
import { u128Schema } from "../schemas";
import {
  decodeBigIntFromLEBytes,
  decodeU128sFromSimulationResult,
  decodeU128sToString,
  decodeU128ToString,
} from "../decoders";
import { encodeStringToU128Array } from "../encoders";
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

    let nameEncoded = encodeStringToU128Array(parsedParams.data.name);

    if (nameEncoded.length > 2) {
      return new BoxedError(
        AlkanesExecuteError.InvalidParams,
        "Name must be at most 2 u128s (32 bytes) long"
      );
    }
    if (nameEncoded.length === 1) {
      nameEncoded.push(0n); // pad with zero if only one u128 is provided
    }

    let symbolEncoded = encodeStringToU128Array(parsedParams.data.symbol);
    if (symbolEncoded.length > 1) {
      return new BoxedError(
        AlkanesExecuteError.InvalidParams,
        "Symbol must be at most 1 u128 (16 bytes) long"
      );
    }

    let callData: bigint[] = [
      0n, // opcode for Initialize
      parsedParams.data.token_units ?? 0n,
      parsedParams.data.value_per_mint ?? 0n,
      parsedParams.data.cap ?? 0n,
      ...nameEncoded,
      ...symbolEncoded,
    ];

    let executionResult = await this.pushExecute({
      address,
      callData,
    });

    if (isBoxedError(executionResult)) {
      return executionResult;
    }

    return new BoxedSuccess(true);
  }

  async mintTokens(
    address: string,
    params: { amount?: bigint }
  ): Promise<BoxedResponse<boolean, AlkanesExecuteError>> {
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

    let executionResult = await this.pushExecute({
      address,
      callData,
    });

    if (isBoxedError(executionResult)) {
      return executionResult;
    }

    return new BoxedSuccess(true);
  }
  async viewGetName(): Promise<BoxedResponse<string, AlkanesSimulationError>> {
    let callData: bigint[] = [99n]; // opcode for GetName
    let simulationResult = await this.simulate({
      inputs: callData.map((v) => v.toString()),
    });
    if (isBoxedError(simulationResult)) {
      return new BoxedError(
        AlkanesSimulationError.UnknownError,
        "Simulation failed: " + simulationResult.message
      );
    }

    const u128Array = decodeU128sFromSimulationResult(simulationResult.data);
    if (isBoxedError(u128Array)) {
      return new BoxedError(
        AlkanesSimulationError.UnknownError,
        "Simulation failed: " + u128Array.message
      );
    }

    return new BoxedSuccess(decodeU128sToString(u128Array.data));
  }

  async viewGetSymbol(): Promise<
    BoxedResponse<string, AlkanesSimulationError>
  > {
    let callData: bigint[] = [100n]; // opcode for GetSymbol
    let simulationResult = await this.simulate({
      inputs: callData.map((v) => v.toString()),
    });
    if (isBoxedError(simulationResult)) {
      return new BoxedError(
        AlkanesSimulationError.UnknownError,
        "Simulation failed: " + simulationResult.message
      );
    }

    const u128Array = decodeU128sFromSimulationResult(simulationResult.data);
    if (isBoxedError(u128Array)) {
      return new BoxedError(
        AlkanesSimulationError.UnknownError,
        "Simulation failed: " + u128Array.message
      );
    }

    return new BoxedSuccess(decodeU128sToString(u128Array.data));
  }

  async viewGetTotalSupply(): Promise<
    BoxedResponse<bigint, AlkanesSimulationError>
  > {
    let callData: bigint[] = [101n]; // opcode for GetTotalSupply
    let simulationResult = await this.simulate({
      inputs: callData.map((v) => v.toString()),
    });
    if (isBoxedError(simulationResult)) {
      return new BoxedError(
        AlkanesSimulationError.UnknownError,
        "Simulation failed: " + simulationResult.message
      );
    }
    const u128Array = decodeU128sFromSimulationResult(simulationResult.data);
    if (isBoxedError(u128Array)) {
      return new BoxedError(
        AlkanesSimulationError.UnknownError,
        "Simulation failed: " + u128Array.message
      );
    }
    return new BoxedSuccess(u128Array.data[0]);
  }

  async viewGetCap(): Promise<BoxedResponse<bigint, AlkanesSimulationError>> {
    let callData: bigint[] = [102n]; // opcode for GetCap
    let simulationResult = await this.simulate({
      inputs: callData.map((v) => v.toString()),
    });
    if (isBoxedError(simulationResult)) {
      return new BoxedError(
        AlkanesSimulationError.UnknownError,
        "Simulation failed: " + simulationResult.message
      );
    }
    const u128Array = decodeU128sFromSimulationResult(simulationResult.data);
    if (isBoxedError(u128Array)) {
      return new BoxedError(
        AlkanesSimulationError.UnknownError,
        "Simulation failed: " + u128Array.message
      );
    }
    return new BoxedSuccess(u128Array.data[0]);
  }
  async viewGetMinted(): Promise<
    BoxedResponse<bigint, AlkanesSimulationError>
  > {
    let callData: bigint[] = [103n]; // opcode for GetMinted
    let simulationResult = await this.simulate({
      inputs: callData.map((v) => v.toString()),
    });
    if (isBoxedError(simulationResult)) {
      return new BoxedError(
        AlkanesSimulationError.UnknownError,
        "Simulation failed: " + simulationResult.message
      );
    }
    const u128Array = decodeU128sFromSimulationResult(simulationResult.data);
    if (isBoxedError(u128Array)) {
      return new BoxedError(
        AlkanesSimulationError.UnknownError,
        "Simulation failed: " + u128Array.message
      );
    }
    return new BoxedSuccess(u128Array.data[0]);
  }

  async viewGetValuePerMint(): Promise<
    BoxedResponse<bigint, AlkanesSimulationError>
  > {
    let callData: bigint[] = [104n]; // opcode for GetValuePerMint
    let simulationResult = await this.simulate({
      inputs: callData.map((v) => v.toString()),
    });
    if (isBoxedError(simulationResult)) {
      return new BoxedError(
        AlkanesSimulationError.UnknownError,
        "Simulation failed: " + simulationResult.message
      );
    }
    const u128Array = decodeU128sFromSimulationResult(simulationResult.data);
    if (isBoxedError(u128Array)) {
      return new BoxedError(
        AlkanesSimulationError.UnknownError,
        "Simulation failed: " + u128Array.message
      );
    }
    return new BoxedSuccess(u128Array.data[0]);
  }

  async viewGetData(): Promise<
    BoxedResponse<Uint8Array, AlkanesSimulationError>
  > {
    let callData: bigint[] = [1000n]; // opcode for GetData
    let simulationResult = await this.simulate({
      inputs: callData.map((v) => v.toString()),
    });
    if (isBoxedError(simulationResult)) {
      return new BoxedError(
        AlkanesSimulationError.UnknownError,
        "Simulation failed: " + simulationResult.message
      );
    }

    let leBytes = simulationResult.data.parsed?.le;
    if (!leBytes) {
      return new BoxedError(
        AlkanesSimulationError.UnknownError,
        "Simulation result does not contain 'le' field"
      );
    }

    return new BoxedSuccess(hexToUint8Array(leBytes));
  }
}
