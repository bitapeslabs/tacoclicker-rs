import {
  BoxedResponse,
  BoxedSuccess,
  BoxedError,
  consumeOrThrow,
} from "@/boxed";
import {
  DecodableAlkanesResponse,
  BaseTokenContract,
  AlkanesExecuteError,
  Encodable,
} from "tacoclicker-sdk";
import { BorshWordCountRequest, BorshWordCountResponse } from "./schemas";

export class SandboxContract extends BaseTokenContract {
  public get OpCodes() {
    return {
      ...super.OpCodes,
      echo: 105n, // opcode for Echo
      wordCount: 106n, // opcode for Word Count
    } as const;
  }

  async viewEcho(
    params: bigint[]
  ): Promise<BoxedResponse<string, AlkanesExecuteError>> {
    try {
      let callData: bigint[] = [
        this.OpCodes.echo, // opcode for Initialize
        ...params, // params for Initialize
      ];

      let response = consumeOrThrow(
        await this.simulate({
          callData,
        })
      );

      let decodable = new DecodableAlkanesResponse(response);

      return new BoxedSuccess(decodable.toHex());
    } catch (error) {
      return new BoxedError(
        AlkanesExecuteError.UnknownError,
        "Execution failed: " + (error as Error).message
      );
    }
  }

  async viewWordCount(
    string: string
  ): Promise<BoxedResponse<BorshWordCountResponse, AlkanesExecuteError>> {
    try {
      let callData: bigint[] = [
        this.OpCodes.wordCount, // opcode for Word Count
        ...consumeOrThrow(
          new Encodable(
            {
              data: string,
            },
            BorshWordCountRequest
          ).fromObject()
        ),
      ];

      let response = consumeOrThrow(
        await this.simulate({
          callData,
        })
      );

      let decodable = new DecodableAlkanesResponse(
        response,
        BorshWordCountResponse
      );
      let decodedResponse = decodable.toObject();

      return new BoxedSuccess(decodedResponse);
    } catch (error) {
      return new BoxedError(
        AlkanesExecuteError.UnknownError,
        "Execution failed: " + (error as Error).message
      );
    }
  }
}
