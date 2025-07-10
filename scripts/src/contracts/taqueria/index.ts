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
} from "tacoclicker-sdk";

export class TaqueriaContract extends BaseTokenContract {
  public get OpCodes() {
    return {
      ...super.OpCodes,
      echo: 105n, // opcode for Echo
      word_count: 106n, // opcode for Word Count
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
}
