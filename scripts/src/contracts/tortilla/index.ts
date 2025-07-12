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
  AlkanesSimulationResult,
  AlkanesSimulationError,
  schemaAlkaneId,
} from "tacoclicker-sdk";
import {
  schemaAlkaneList,
  schemaTortillaConsts,
  ISchemaAlkaneList,
  ISchemaTortillaConsts,
} from "./schemas";
import { ISchemaAlkaneId } from "tacoclicker-sdk";
import { TaqueriaContract } from "../taqueria";
import chalk from "chalk";

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
    params: ISchemaTortillaConsts
  ): Promise<
    BoxedResponse<AlkanesPushExecuteResponse<void>, AlkanesExecuteError>
  > {
    try {
      //We need to pass a CLASS of schmeaAlkaneId, not an instance
      const encodableParams: ISchemaTortillaConsts = {
        taqueria_factory_alkane_id: params.taqueria_factory_alkane_id,
        salsa_alkane_id: params.salsa_alkane_id,
      };

      let callData: bigint[] = [
        this.OpCodes.Initialize,
        ...consumeOrThrow(
          new Encodable(encodableParams, schemaTortillaConsts).fromObject()
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
    BoxedResponse<ISchemaTortillaConsts, AlkanesExecuteError>
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
          schemaTortillaConsts
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
  ): Promise<
    BoxedResponse<
      AlkanesPushExecuteResponse<ISchemaAlkaneId>,
      AlkanesExecuteError
    >
  > {
    try {
      let callData: bigint[] = [this.OpCodes.Register]; // opcode for Register

      let response = consumeOrThrow(
        await this.pushExecute(
          {
            transfers: [
              {
                asset: "btc",
                address: TortillaContract.TORTILLA_FUNDING_ADDRESS,
                amount,
              } as SingularBTCTransfer,
            ],
            address,
            callData,
          },
          schemaAlkaneId
        )
      );

      return new BoxedSuccess(response);
    } catch (error) {
      return new BoxedError(
        AlkanesExecuteError.UnknownError,
        "Execution failed: " + (error as Error).message
      );
    }
  }

  //Special handler that fetches alkanes, parses them, sends them to contract, gets which ones are valid, and returns them
  async viewGetTaquerias(
    address: string
  ): Promise<BoxedResponse<ISchemaAlkaneId[], AlkanesExecuteError>> {
    try {
      let alkanesAddressResponse = consumeOrThrow(
        await this.provider.rpc.alkanes.alkanes_getAlkanesByAddress(address)
      );

      let alkaneIds: Set<string> = new Set(
        alkanesAddressResponse.outpoints
          .map((outpoint) =>
            outpoint.runes.map(
              (alkane) => `${alkane.rune.id.block}:${alkane.rune.id.tx}`
            )
          )
          .flat()
      );

      let alkanes: ISchemaAlkaneId[] = Array.from(alkaneIds).map((alkaneId) => {
        const [block, tx] = alkaneId.split(":");
        return {
          block: Number(block),
          tx: BigInt(tx),
        };
      });

      let callData: bigint[] = [
        this.OpCodes.GetTaqueriasFromAlkaneList,
        ...consumeOrThrow(
          new Encodable({ alkanes }, schemaAlkaneList).fromObject()
        ),
      ];

      let simulationResult = consumeOrThrow(
        await this.simulate({
          callData,
        })
      );

      let result = new DecodableAlkanesResponse(
        simulationResult,
        schemaAlkaneList
      );

      console.log("Hex: " + result.toHex());

      return new BoxedSuccess(result.toObject().alkanes);
    } catch (error) {
      console.error("Error in viewGetTaquerias:", error);
      return new BoxedError(
        AlkanesExecuteError.UnknownError,
        "Simulation failed: " + (error as Error).message
      );
    }
  }

  //Syntax sugar for getting a new Taqueria contract from the first alkane in the list from the function in viewGetTaquerias
  async viewGetTaqueria(
    address: string
  ): Promise<BoxedResponse<TaqueriaContract, AlkanesSimulationError>> {
    try {
      let taquerias = consumeOrThrow(await this.viewGetTaquerias(address));

      if (taquerias.length === 0) {
        return new BoxedError(
          AlkanesSimulationError.UnknownError,
          "No taquerias found for this address"
        );
      }

      let taqueriaAlkane = taquerias[0];

      let taqueria = new TaqueriaContract(
        this.provider,
        {
          block: BigInt(taqueriaAlkane.block),
          tx: BigInt(taqueriaAlkane.tx),
        },
        this.signPsbt
      );

      return new BoxedSuccess(taqueria);
    } catch (error) {
      console.log(chalk.red("Error in viewGetTaqueria:"), error);
      return new BoxedError(
        AlkanesSimulationError.UnknownError,
        "Simulation failed: " + (error as Error).message
      );
    }
  }
}
