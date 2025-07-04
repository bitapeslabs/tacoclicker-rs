import { BoxedError, BoxedSuccess, BoxedResponse, isBoxedError } from "@/boxed";
import {
  EsploraAddressResponse,
  EsploraFetchError,
  EsploraUtxo,
  IEsploraSpendableUtxo,
  IEsploraTransaction,
} from "./types";
import { satsToBTC, getEsploraTransactionWithHex } from "@/crypto/utils";
import { Provider } from "@/provider";

export class ElectrumApiProvider {
  constructor(private readonly provider: Provider) {}

  private get electrumApiUrl(): string {
    return this.provider.electrumApiUrl.replace(/\/+$/, "");
  }
  async esplora_getaddress(
    address: string
  ): Promise<BoxedResponse<EsploraAddressResponse, EsploraFetchError>> {
    try {
      const requestUrl = `${this.electrumApiUrl}/address/${address}`;
      const httpResponse = await fetch(requestUrl);

      if (!httpResponse.ok) {
        return new BoxedError(
          EsploraFetchError.UnknownError,
          `Failed to fetch address data from ${requestUrl}: ${httpResponse.statusText}`
        );
      }

      const json = (await httpResponse.json()) as EsploraAddressResponse;
      return new BoxedSuccess(json);
    } catch (error) {
      return new BoxedError(
        EsploraFetchError.UnknownError,
        `Failed to fetch address data: ${(error as Error).message}`
      );
    }
  }

  async esplora_getaddressbalance(
    address: string
  ): Promise<BoxedResponse<number, EsploraFetchError>> {
    const addressResponse = await this.esplora_getaddress(address);
    if (isBoxedError(addressResponse)) return addressResponse;

    const { funded_txo_sum, spent_txo_sum } = addressResponse.data.chain_stats;
    const satoshiBalance = funded_txo_sum - spent_txo_sum;

    return new BoxedSuccess(satsToBTC(satoshiBalance));
  }
  async esplora_getutxos(
    address: string
  ): Promise<BoxedResponse<EsploraUtxo[], EsploraFetchError>> {
    try {
      const requestUrl = `${this.electrumApiUrl}/address/${address}/utxo`;
      const httpResponse = await fetch(requestUrl);

      if (!httpResponse.ok) {
        return new BoxedError(
          EsploraFetchError.UnknownError,
          `Failed to fetch UTXOs from ${requestUrl}: ${httpResponse.statusText}`
        );
      }

      const utxos = (await httpResponse.json()) as EsploraUtxo[];
      const confirmedUtxos = utxos.filter((utxo) => utxo.status.confirmed);

      return new BoxedSuccess(confirmedUtxos);
    } catch (error) {
      return new BoxedError(
        EsploraFetchError.UnknownError,
        `Failed to fetch UTXOs: ${(error as Error).message}`
      );
    }
  }
  async esplora_getfee(): Promise<BoxedResponse<number, EsploraFetchError>> {
    try {
      const requestUrl = `${this.electrumApiUrl}/fee-estimates`;
      const httpResponse = await fetch(requestUrl);

      if (!httpResponse.ok) {
        return new BoxedError(
          EsploraFetchError.UnknownError,
          `Failed to fetch fee estimates from ${requestUrl}: ${httpResponse.statusText}`
        );
      }

      const estimates = await httpResponse.json();
      const fastestFee = estimates["1"];

      if (fastestFee === undefined) {
        return new BoxedError(
          EsploraFetchError.UnknownError,
          `Fee tier "1" not available in response`
        );
      }

      return new BoxedSuccess(Number(fastestFee));
    } catch (error) {
      return new BoxedError(
        EsploraFetchError.UnknownError,
        `Failed to fetch fee estimates: ${(error as Error).message}`
      );
    }
  }
  async esplora_broadcastTx(
    rawTransactionHex: string,
    customElectrumUrl?: string
  ): Promise<BoxedResponse<string, EsploraFetchError>> {
    try {
      const baseUrl = (customElectrumUrl ?? this.electrumApiUrl).replace(
        /\/+$/,
        ""
      );
      const requestUrl = `${baseUrl}/tx`;

      const httpResponse = await fetch(requestUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: rawTransactionHex,
      });

      if (!httpResponse.ok) {
        const errorMessage = await httpResponse.text();
        return new BoxedError(
          EsploraFetchError.UnknownError,
          `Failed to broadcast transaction: ${errorMessage}`
        );
      }

      const transactionId = (await httpResponse.text()).trim();
      return new BoxedSuccess(transactionId);
    } catch (error) {
      return new BoxedError(
        EsploraFetchError.UnknownError,
        `Failed to broadcast transaction: ${(error as Error).message}`
      );
    }
  }
  async esplora_getaddresstxs(
    address: string,
    lastSeenTransactionId?: string
  ): Promise<BoxedResponse<IEsploraTransaction[], EsploraFetchError>> {
    try {
      const basePath = `${this.electrumApiUrl}/address/${address}/txs`;
      const requestUrl = lastSeenTransactionId
        ? `${basePath}/chain/${lastSeenTransactionId}`
        : basePath;

      const httpResponse = await fetch(requestUrl);
      if (!httpResponse.ok) {
        return new BoxedError(
          EsploraFetchError.UnknownError,
          `Failed to fetch transactions from ${requestUrl}: ${httpResponse.statusText}`
        );
      }

      const transactions = (await httpResponse.json()) as IEsploraTransaction[];
      return new BoxedSuccess(transactions);
    } catch (error) {
      return new BoxedError(
        EsploraFetchError.UnknownError,
        `Failed to fetch address transactions: ${(error as Error).message}`
      );
    }
  }

  async esplora_getbulktransactions(
    transactionIds: string[]
  ): Promise<BoxedResponse<IEsploraTransaction[], EsploraFetchError>> {
    try {
      const requestUrl = `${this.electrumApiUrl}/txs`;

      const httpResponse = await fetch(requestUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ txs: transactionIds }),
      });

      if (!httpResponse.ok) {
        return new BoxedError(
          EsploraFetchError.UnknownError,
          `Failed to fetch transactions from ${requestUrl}: ${httpResponse.statusText}`
        );
      }

      const transactions = (await httpResponse.json()) as IEsploraTransaction[];
      return new BoxedSuccess(transactions);
    } catch (error) {
      return new BoxedError(
        EsploraFetchError.UnknownError,
        `Failed to fetch bulk transactions: ${(error as Error).message}`
      );
    }
  }
  async esplora_getspendableinputs(
    utxoList: EsploraUtxo[]
  ): Promise<BoxedResponse<IEsploraSpendableUtxo[], EsploraFetchError>> {
    const bulkResponse = await this.esplora_getbulktransactions(
      utxoList.map((input) => input.txid)
    );
    if (isBoxedError(bulkResponse)) return bulkResponse;

    const transactionMap = new Map(
      bulkResponse.data.map((tx) => [tx.txid, tx])
    );

    const spendableInputs: IEsploraSpendableUtxo[] = [];

    for (const unspentOutput of utxoList) {
      const fullTransaction = transactionMap.get(unspentOutput.txid);
      if (!fullTransaction) {
        return new BoxedError(
          EsploraFetchError.UnknownError,
          `Transaction not found for txid ${unspentOutput.txid}`
        );
      }
      spendableInputs.push({
        ...unspentOutput,
        prevTx: getEsploraTransactionWithHex(fullTransaction),
      });
    }
    return new BoxedSuccess(spendableInputs);
  }
}

export * from "./types";
