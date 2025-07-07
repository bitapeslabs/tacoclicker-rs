import * as bitcoin from "bitcoinjs-lib";
import {
  type SandshrewBitcoinClient,
  type EsploraRpc,
  type OrdRpc,
  type AlkanesRpc,
} from "../rpclient";
export interface IOylProvider {
  /** RPC helpers */
  sandshrew: SandshrewBitcoinClient;
  esplora: EsploraRpc;
  ord: OrdRpc;
  alkanes: AlkanesRpc;

  /** Optional custom API provider you injected */
  api: string;

  /** Bitcoin-JS network object (regtest, testnet, mainnet…) */
  network: bitcoin.networks.Network;

  /** Human-readable network label you supplied (e.g. `"regtest"`) */
  networkType: string;

  /** Base URL assembled from `{ url, version, projectId }` */
  url: string;

  /**
   * Broadcast a PSBT — accepts *either* hex or base64.
   * Throws if the mempool rejects it.
   */
  pushPsbt(args: { psbtHex?: string; psbtBase64?: string }): Promise<{
    txId: string;
    rawTx: string;
    size: number; // virtual‐size (vB)
    weight: number; // WU
    fee: number; // satoshis
    satsPerVByte: string; // fee density, formatted with 2 decimals
  }>;
}

/* If you also need the constructor args: */
export interface OylProviderCtor {
  url: string;
  projectId?: string;
  version?: string; // default "v1"
  network: bitcoin.networks.Network;
  networkType: string;
  apiProvider?: any;
}
