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
  AlkanesExecuteResponse,
  SingularBTCTransfer,
  AlkanesPushExecuteResponse,
} from "tacoclicker-sdk";
import { SchemaAlkaneId, SchemaTortillaConsts } from "./schemas";

export class TortillaContract extends BaseTokenContract {
  public static readonly TAQUERIA_COST_SATS = 21_000;
  public static readonly TORTILLA_FUNDING_ADDRESS =
    "bcrt1pluksgqq4kf0kwu3unj00p4mla3xk7tq5ay49wnewt8eydmq22mhsn4qdaw";

  public get OpCodes() {
    return {
      ...super.OpCodes,
      GetConsts: 105n,
      Register: 106n,
      GetTaqueriasFromAlkaneList: 107n,
    } as const;
  }

  // @ts-expect-error override signature on purpose
  public override async initialize(
    address: string,
    params: ConstructorParameters<typeof SchemaTortillaConsts>[0]
  ): Promise<BoxedResponse<AlkanesPushExecuteResponse, AlkanesExecuteError>> {
    try {
      //We need to pass a CLASS of schmeaAlkaneId, not an instance
      const encodableParams: ConstructorParameters<
        typeof SchemaTortillaConsts
      >[0] = {
        taqueria_factory_alkane_id: new SchemaAlkaneId({
          block: params.taqueria_factory_alkane_id.block,
          tx: params.taqueria_factory_alkane_id.tx,
        }),
        salsa_alkane_id: new SchemaAlkaneId({
          block: params.salsa_alkane_id.block,
          tx: params.salsa_alkane_id.tx,
        }),
      };

      let callData: bigint[] = [
        this.OpCodes.Initialize,
        ...consumeOrThrow(
          new Encodable(encodableParams, SchemaTortillaConsts).fromObject()
        ),
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

  async getConsts(): Promise<
    BoxedResponse<SchemaTortillaConsts, AlkanesExecuteError>
  > {
    try {
      let callData: bigint[] = [this.OpCodes.GetConsts]; // opcode for GetConsts

      let simulationResult = consumeOrThrow(
        await this.simulate({
          callData,
        })
      );

      return new BoxedSuccess(
        new DecodableAlkanesResponse(
          simulationResult,
          SchemaTortillaConsts
        ).toObject()
      );
    } catch (error) {
      return new BoxedError(
        AlkanesExecuteError.UnknownError,
        "Simulation failed: " + (error as Error).message
      );
    }
  }
  async register(
    address: string,
    amount: number = TortillaContract.TAQUERIA_COST_SATS
  ): Promise<BoxedResponse<AlkanesPushExecuteResponse, AlkanesExecuteError>> {
    try {
      let callData: bigint[] = [this.OpCodes.Register]; // opcode for Register

      let response = consumeOrThrow(
        await this.pushExecute({
          transfers: [
            {
              asset: "btc",
              address: TortillaContract.TORTILLA_FUNDING_ADDRESS,
              amount,
            } as SingularBTCTransfer,
          ],
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
}
