import { BoxedError, BoxedSuccess, BoxedResponse, isBoxedError } from "@/boxed";
import { Provider } from "@/provider";
import { decodeCBOR } from "./utils";

import {
  OrdPaginatedIds,
  OrdInscription,
  OrdOutput,
  OrdSat,
  OrdBlock,
} from "./types";

export enum OrdFetchError {
  UnknownError = "UnknownError",
  RpcError = "RpcError",
}

export class OrdRpcProvider {
  constructor(private readonly provider: Provider) {}

  private get rpc() {
    return this.provider.buildRpcCall.bind(this.provider);
  }

  ord_getInscriptions(startingNumber?: string) {
    return this.rpc<OrdPaginatedIds>("ord_inscriptions", [
      startingNumber ?? "",
    ]);
  }

  ord_getInscriptionsByBlockHash(blockHash: string) {
    return this.rpc<OrdBlock>("ord_block", [blockHash]);
  }

  ord_getInscriptionsByBlockHeight(blockHeight: string, page?: string) {
    return this.rpc<OrdBlock>("ord_inscriptions:block", [
      blockHeight,
      ...(page ? [page] : []),
    ]);
  }
  ord_getInscriptionById(inscriptionId: string) {
    return this.rpc<OrdInscription>("ord_inscription", [inscriptionId]);
  }

  ord_getInscriptionByNumber(inscriptionNumber: string) {
    return this.rpc<OrdInscription>("ord_inscription", [inscriptionNumber]);
  }

  ord_getInscriptionContent(inscriptionId: string) {
    return this.rpc<string>("ord_content", [inscriptionId]);
  }

  ord_getInscriptionPreview(inscriptionId: string) {
    return this.rpc<string>("ord_preview", [inscriptionId]);
  }

  ord_getInscriptionChildren(inscriptionId: string, page?: string) {
    return this.rpc<OrdPaginatedIds>("ord_r:children", [
      inscriptionId,
      ...(page ? [page] : []),
    ]);
  }

  ord_getTxOutput(txidAndVout: string) {
    return this.rpc<OrdOutput>("ord_output", [txidAndVout]);
  }

  ord_getSatByNumber(satoshiNumber: string) {
    return this.rpc<OrdSat>("ord_sat", [satoshiNumber]);
  }

  ord_getSatByDecimal(decimalNotation: string) {
    return this.rpc<OrdSat>("ord_sat", [decimalNotation]);
  }

  ord_getSatByDegree(degreeNotation: string) {
    return this.rpc<OrdSat>("ord_sat", [degreeNotation]);
  }

  ord_getSatByName(satoshiName: string) {
    return this.rpc<OrdSat>("ord_sat", [satoshiName]);
  }

  ord_getSatByPercentile(percentileString: string) {
    return this.rpc<OrdSat>("ord_sat", [percentileString]);
  }

  ord_getInscriptionIdsBySat(satoshiNumber: string, page?: string) {
    return this.rpc<OrdPaginatedIds>("ord_r:sat", [
      satoshiNumber,
      ...(page ? [page] : []),
    ]);
  }

  ord_getInscriptionIdBySatAt(satoshiNumber: string, index?: string) {
    return this.rpc<{ id: string }>("ord_r:sat::at", [
      satoshiNumber,
      ...(index ? [index] : []),
    ]);
  }

  ord_getRuneByName(runeName: string) {
    return this.rpc<unknown>("ord_rune", [runeName]);
  }

  ord_getRuneById(runeId: string) {
    return this.rpc<unknown>("ord_rune", [runeId]);
  }

  ord_getRunes() {
    return this.rpc<unknown>("ord_runes");
  }

  ord_getAddressData(address: string) {
    return this.rpc<unknown>("ord_address", [address]);
  }

  async ord_getInscriptionMetadata(
    inscriptionId: string
  ): Promise<BoxedResponse<unknown, string>> {
    const hexResponse = await this.rpc<string>("ord_r:metadata", [
      inscriptionId,
    ]).call();

    if (isBoxedError(hexResponse)) return hexResponse;

    try {
      const decoded = decodeCBOR(hexResponse.data);
      return new BoxedSuccess(decoded);
    } catch (error) {
      return new BoxedError(
        OrdFetchError.UnknownError,
        (error as Error).message ?? "Failed to decode CBOR"
      );
    }
  }
}

export * from "./types";
export * from "./utils";
