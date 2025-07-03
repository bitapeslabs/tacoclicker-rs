import { ELECTRUM_API_URL } from "@/consts";
import { getEsploraTransactionWithHex, satsToBTC } from "@/crypto/utils";
import {
  type EsploraAddressResponse,
  EsploraFetchError,
  type EsploraUtxo,
  type IEsploraSpendableUtxo,
  type IEsploraTransaction,
} from "./types";

import { get } from "http";
import {
  BoxedError,
  type BoxedResponse,
  BoxedSuccess,
  isBoxedError,
} from "@/boxed";
export async function esplora_getaddress(
  address: string
): Promise<BoxedResponse<EsploraAddressResponse, EsploraFetchError>> {
  try {
    const url = `${ELECTRUM_API_URL}/address/${address}`;
    const res = await fetch(url);

    if (!res.ok) {
      return new BoxedError(
        EsploraFetchError.UnknownError,
        `Failed to fetch address data from ${url}: ${res.statusText}`
      );
    }

    const json = await res.json();
    return new BoxedSuccess(json as EsploraAddressResponse);
  } catch (error) {
    return new BoxedError(
      EsploraFetchError.UnknownError,
      `Failed to fetch address data: ${(error as Error).message}`
    );
  }
}

export async function esplora_getaddressbalance(
  address: string
): Promise<BoxedResponse<number, EsploraFetchError>> {
  try {
    const addressResponse = await esplora_getaddress(address);
    if (isBoxedError(addressResponse)) {
      return addressResponse;
    }
    const { chain_stats } = addressResponse.data;
    const balance = chain_stats.funded_txo_sum - chain_stats.spent_txo_sum;

    return new BoxedSuccess(satsToBTC(balance));
  } catch (error) {
    return new BoxedError(
      EsploraFetchError.UnknownError,
      `Failed to fetch address balance: ${(error as Error).message}`
    );
  }
}

export async function esplora_getutxos(
  address: string
): Promise<BoxedResponse<EsploraUtxo[], EsploraFetchError>> {
  try {
    const url = `${ELECTRUM_API_URL}/address/${address}/utxo`;
    const res = await fetch(url);

    if (!res.ok) {
      return new BoxedError(
        EsploraFetchError.UnknownError,
        `Failed to fetch UTXOs from ${url}: ${res.statusText}`
      );
    }

    const utxos = (await res.json()).filter(
      (utxo: EsploraUtxo) => utxo.status.confirmed
    );

    return new BoxedSuccess(utxos);
  } catch (error) {
    return new BoxedError(
      EsploraFetchError.UnknownError,
      `Failed to fetch UTXOs: ${(error as Error).message}`
    );
  }
}

export async function esplora_getfee(): Promise<
  BoxedResponse<number, EsploraFetchError>
> {
  try {
    const url = `${ELECTRUM_API_URL}/fee-estimates`;

    const res = await fetch(url);
    if (!res.ok) {
      return new BoxedError(
        EsploraFetchError.UnknownError,
        `Failed to fetch fee estimates from ${url}: ${res.statusText}`
      );
    }

    const json = await res.json();

    if (!json["1"]) {
      return new BoxedError(
        EsploraFetchError.UnknownError,
        `Fee tier "1" not available in response`
      );
    }

    return new BoxedSuccess(Number(json["1"]));
  } catch (error) {
    return new BoxedError(
      EsploraFetchError.UnknownError,
      `Failed to fetch fee estimates: ${(error as Error).message}`
    );
  }
}

export async function esplora_broadcastTx(
  rawHex: string,
  electrumProvider?: string
): Promise<BoxedResponse<string, EsploraFetchError>> {
  try {
    const url = `${electrumProvider ?? ELECTRUM_API_URL}/tx`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: rawHex,
    });

    if (!res.ok) {
      const msg = await res.text();
      return new BoxedError(
        EsploraFetchError.UnknownError,
        `Failed to broadcast transaction: ${msg}`
      );
    }

    const txid = await res.text(); // response is just the txid as plain text
    return new BoxedSuccess(txid.trim());
  } catch (error) {
    return new BoxedError(
      EsploraFetchError.UnknownError,
      `Failed to broadcast transaction: ${(error as Error).message}`
    );
  }
}

export async function esplora_getaddresstxs(
  address: string,
  lastSeenTxid?: string
): Promise<BoxedResponse<IEsploraTransaction[], EsploraFetchError>> {
  try {
    const base = `${ELECTRUM_API_URL}/address/${address}/txs`;
    const url = lastSeenTxid ? `${base}/chain/${lastSeenTxid}` : base;

    const res = await fetch(url);
    if (!res.ok) {
      return new BoxedError(
        EsploraFetchError.UnknownError,
        `Failed to fetch transactions from ${url}: ${res.statusText}`
      );
    }

    const json = await res.json();
    // Esplora returns an array; cast to our typed interface
    return new BoxedSuccess(json as IEsploraTransaction[]);
  } catch (error) {
    return new BoxedError(
      EsploraFetchError.UnknownError,
      `Failed to fetch address transactions: ${(error as Error).message}`
    );
  }
}

export async function esplora_getbulktransactions(
  txids: string[]
): Promise<BoxedResponse<IEsploraTransaction[], EsploraFetchError>> {
  try {
    const url = `${ELECTRUM_API_URL}/txs`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ txs: txids }),
    });
    if (!res.ok) {
      return new BoxedError(
        EsploraFetchError.UnknownError,
        `Failed to fetch transactions from ${url}: ${res.statusText}`
      );
    }

    const json = await res.json();
    // Esplora returns an array; cast to our typed interface
    return new BoxedSuccess(json as IEsploraTransaction[]);
  } catch (error) {
    return new BoxedError(
      EsploraFetchError.UnknownError,
      `Failed to fetch bulk transactions: ${(error as Error).message}`
    );
  }
}

export const esplora_getspendableinputs = async (
  inputs: EsploraUtxo[]
): Promise<BoxedResponse<IEsploraSpendableUtxo[], EsploraFetchError>> => {
  try {
    const fullTransactionsResponse = await esplora_getbulktransactions(
      inputs.map((input) => input.txid)
    );

    if (isBoxedError(fullTransactionsResponse)) {
      return fullTransactionsResponse;
    }

    const fullTransactions = fullTransactionsResponse.data.filter(
      (tx) => tx.txid
    );

    const transactionMap = new Map(fullTransactions.map((tx) => [tx.txid, tx]));

    const response: IEsploraSpendableUtxo[] = [];

    for (const input of inputs) {
      const tx = transactionMap.get(input.txid);
      if (!tx) {
        return new BoxedError(
          EsploraFetchError.UnknownError,
          `Input not found in inputs map for txid: ${input.txid}`
        );
      }
      response.push({
        ...input,
        prevTx: getEsploraTransactionWithHex(tx),
      });
    }
    return new BoxedSuccess(response);
  } catch (error) {
    return new BoxedError(
      EsploraFetchError.UnknownError,
      `Failed to get spendable inputs: ${(error as Error).message}`
    );
  }
};
export * from "./types";
