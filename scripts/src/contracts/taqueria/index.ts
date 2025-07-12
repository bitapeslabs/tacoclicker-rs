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
  AlkanesPushExecuteResponse,
} from "tacoclicker-sdk";
import { schemaAlkaneId, ISchemaAlkaneId } from "tacoclicker-sdk";
export class TaqueriaContract extends BaseTokenContract {
  public get OpCodes() {
    return {
      ...super.OpCodes,
      GetTortillaId: 105n,
    } as const;
  }

  // @ts-expect-error override signature on purpose
  public override async initialize(
    address: string,
    tortillaAlkaneId: ISchemaAlkaneId
  ): Promise<
    BoxedResponse<AlkanesPushExecuteResponse<void>, AlkanesExecuteError>
  > {
    throw new Error(
      `Taqueria factory must be initialized through the Tortilla contract. 
While you can call this method, not cloning through the Tortilla contract will decouple your 
game from Tortilla and you will not be allowed to mint tortillas.
`
    );
  }

  async getTortillaId(): Promise<
    BoxedResponse<ISchemaAlkaneId, AlkanesExecuteError>
  > {
    try {
      let callData: bigint[] = [this.OpCodes.GetTortillaId]; // opcode for GetConsts

      let simulationResult = consumeOrThrow(
        await this.simulate({
          callData,
        })
      );

      return new BoxedSuccess(
        new DecodableAlkanesResponse(
          simulationResult,
          schemaAlkaneId
        ).toObject()
      );
    } catch (error) {
      return new BoxedError(
        AlkanesExecuteError.UnknownError,
        "Simulation failed: " + (error as Error).message
      );
    }
  }
}
