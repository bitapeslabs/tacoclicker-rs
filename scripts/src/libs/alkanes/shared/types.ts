import { payments, Psbt } from "bitcoinjs-lib";
import * as bitcoin from "bitcoinjs-lib";
import { ISigner } from "../signer/types";
import { IAccount } from "../account/types";
import { IOylProvider } from "../provider/types";
import { AddressType } from "../account/types";

export interface InscriptionResponse {
  address: string;
  inscriptions?: string;
  scriptPubkey: string;
  transaction: string;
  value: string;
}

export type Network = "mainnet" | "testnet" | "regtest" | "signet";
export type WitnessScriptOptions = {
  pubKeyHex: string;
  mediaContent: string;
  mediaType: string;
  meta: any;
  recover?: boolean;
};

export enum RarityEnum {
  COMMON = "common",
  UNCOMMON = "uncommon",
  RARE = "rare",
  EPIC = "epic",
  LEGENDARY = "legendary",
  MYTHIC = "mythic",
}

export type Rarity = `${RarityEnum}`;

export interface Ordinal {
  number: number;
  decimal: string;
  degree: string;
  name: string;
  height: number;
  cycle: number;
  epoch: number;
  period: number;
  offset: number;
  rarity: Rarity;
  output: string;
  start: number;
  size: number;
}

export interface Inscription {
  id: string;
  outpoint: string;
  owner: string;
  genesis: string;
  fee: number;
  height: number;
  number: number;
  sat: number;
  timestamp: number;
  mediaType: string;
  mediaSize: number;
  mediaContent: string;
  meta?: Record<string, any>;
}

export interface UnspentOutput {
  txId: string;
  outputIndex: number;
  satoshis: number;
  scriptPk: string;
  addressType: AddressType;
  address: string;
  ords: {
    id: string;
    offset: number;
  }[];
}

export interface TxInput {
  data: {
    hash: string;
    index: number;
    witnessUtxo: { value: number; script: Buffer };
    redeemScript?: Buffer;
    tapInternalKey?: Buffer;
    segwitInternalKey?: Buffer;
  };
  utxo: UnspentOutput;
}

export interface TxOutput {
  address: string;
  value: number;
}

export interface ToSignInput {
  index: number;
  publicKey: string;
  sighashTypes?: number[];
}

export interface PrevOut {
  hash: string;
  index: number;
}

export interface Input {
  prevout: PrevOut;
  coin: {
    value: number;
  };
}

export interface Output {
  value: number;
  script: string;
  address: string;
}

export interface Transaction {
  inputs: Input[];
  outputs: Output[];
}

export interface MarketplaceOffer {
  ticker: string;
  offerId: any;
  amount?: string;
  address?: string;
  marketplace: string;
  price?: number;
  unitPrice?: number;
  totalPrice?: number;
  psbt?: string;
  inscriptionId?: string;
}

export enum AssetType {
  BRC20,
  COLLECTIBLE,
  RUNES,
  ALKANES,
}

export type OrdCollectibleData = {
  address: string;
  children: any[];
  content_length: number;
  content_type: string;
  genesis_fee: number;
  genesis_height: number;
  inscription_id: string;
  inscription_number: number;
  next: string;
  output_value: number;
  parent: any;
  previous: string;
  rune: any;
  sat: number;
  satpoint: string;
  timestamp: number;
};

export interface SwapPayload {
  address: string;
  auctionId: string;
  bidPrice: number;
  pubKey: string;
  receiveAddress: string;
  feerate: number;
}

export interface OkxBid {
  ticker?: string;
  amount?: number;
  price?: number;
  fromAddress: string;
  toAddress: string;
  inscriptionId: string;
  buyerPsbt: string;
  orderId: number;
  brc20: boolean;
}

export interface MarketplaceAccount {
  provider?: IOylProvider;
  spendAddress?: string;
  spendPubKey?: string;
  altSpendAddress?: string;
  altSpendPubKey?: string;
  account?: IAccount;
  signer: ISigner;
  assetType: AssetType;
  receiveAddress: string;
  feeRate: number;
}

export interface GetOffersParams {
  ticker: string;
  sort_by?: "unitPrice" | "totalPrice";
  order?: "asc" | "desc";
  limit?: number;
  offset?: number;
}

export interface GetCollectionOffersParams {
  collectionId: string;
  sort_by?: "unitPrice" | "totalPrice";
  order?: "asc" | "desc";
  limit?: number;
  offset?: number;
}

export interface MarketplaceOffers {
  offerId: string;
  marketplace: string;
  ticker: string;
}

export interface RecoverAccountOptions {
  mnemonic?: string;
  activeIndexes?: number[];
  customPath?: "xverse" | "leather" | "unisat" | "testnet";
  network: bitcoin.Network;
}

export interface oylAccounts {
  taproot: {
    taprootKeyring: any;
    taprootAddresses: string[];
    taprootPubKey: string;
  };
  segwit: {
    segwitKeyring: any;
    segwitAddresses: string[];
    segwitPubKey: string;
  };
  initializedFrom: string;
  mnemonic: string;
}

export interface FeeEstimatorOptions {
  feeRate: number;
  network: Network;
  psbt?: Psbt;
  witness?: Buffer[];
}

export interface MarketplaceBuy {
  address: string;
  pubKey: string;
  psbtBase64: string;
  price: number;
  provider?: IOylProvider;
  receiveAddress: string;
  feeRate: number;
  dryRun?: boolean;
}

export interface IBlockchainInfoUTXO {
  tx_hash_big_endian: string;
  tx_hash?: string;
  tx_output_n: number;
  script: string;
  value: number;
  value_hex?: string;
  confirmations: number;
  tx_index: number;
}

export interface txOutputs {
  scriptpubkey: string;
  scriptpubkey_asm: string;
  scriptpubkey_type: string;
  scriptpubkey_address: string;
  value: number;
}

export interface InscribeTransfer {
  fromAddress: string;
  taprootPublicKey: string;
  destinationAddress: string;
  segwitPubKey?: string;
  segwitAddress?: string;
  payFeesWithSegwit?: boolean;
  feeRate?: number;
  token?: string;
  mnemonic: string;
  amount?: number;
  postage?: number;
  segwitHdPath: string;
  isDry?: boolean;
  inscriptionId?: string;
}

export interface SwapBrcBid {
  address: string;
  auctionId: string | string[];
  bidPrice: number | number[];
  feerate: number;
  pubKey: string;
  receiveAddress: string;
  signature?: string;
}

export interface SignedBid {
  psbtBid: string;
  auctionId?: string;
  bidId: string;
}

export const addressTypeToName = {
  p2pkh: "legacy",
  p2tr: "taproot",
  p2sh: "nested-segwit",
  p2wpkh: "segwit",
} as const;

export const internalAddressTypeToName = {
  [AddressType.P2PKH]: "legacy",
  [AddressType.P2TR]: "taproot",
  [AddressType.P2SH_P2WPKH]: "nested-segwit",
  [AddressType.P2WPKH]: "segwit",
} as const;

export const addressNameToType = {
  legacy: "p2pkh",
  taproot: "p2tr",
  "nested-segwit": "p2sh-p2wpkh",
  segwit: "p2wpkh",
} as const;

export type RuneUtxo = {
  outpointId: string;
  amount: number;
  scriptPk: string;
  satoshis: number;
};

export type RuneUTXO = {
  txId: string;
  outputIndex: string;
  amountOfRunes: number;
  address: string;
  scriptPk: string;
  satoshis: number;
};

export type AddressTypes = keyof typeof addressTypeToName;

export type AddressFormats = (typeof addressTypeToName)[AddressTypes];

export interface BitcoinPaymentType {
  type: AddressTypes;
  payload: false | payments.Payment;
}

export interface SwapBrc {
  address: String;
  auctionId: String;
  bidPrice: Number;
  pubKey: String;
  mnemonic: String;
  hdPath: String;
  type: String;
}

export interface TickerDetails {
  ticker: string;
  overall_balance: string;
  available_balance: string;
  transferrable_balance: string;
  image_url: string | null;
}

export interface ApiResponse {
  statusCode: number;
  data: TickerDetails[];
}

export type TxType = "sent" | "received" | "swap" | "unknown";

export type InscriptionType = "brc-20" | "collectible";

export type HistoryTxBrc20Inscription = {
  ticker: string;
  amount: number;
};

export type HistoryTxCollectibleInscription = {
  contentType: string;
  imageUrl: string;
  inscriptionId: string;
  inscriptionNumber: number;
};

export type HistoryBaseTx = {
  txId: string;
  confirmations: number;
  blockTime: number;
  blockHeight: number;
  fee: number;
  type: TxType;
  feeRate: number;
  vinSum: number;
  to?: string;
  from?: string;
  voutSum: number;
  amount: number;
};

export type HistoryBtcTx = HistoryBaseTx & {
  inscriptionDetails: null;
  inscriptionType: null;
};

export type HistoryCollectibleTx = HistoryBaseTx & {
  inscriptionDetails: HistoryTxCollectibleInscription[];
  inscriptionType: "collectible";
};

export type HistoryBrc20Tx = HistoryBaseTx & {
  inscriptionDetails: HistoryTxBrc20Inscription[];
  inscriptionType: "brc-20";
};

export type HistoryTxInscriptionDetails =
  | HistoryTxBrc20Inscription[]
  | HistoryTxCollectibleInscription[];

export type HistoryTx = HistoryBrc20Tx | HistoryCollectibleTx;

export interface AlkanesPayload {
  body: Uint8Array;
  cursed: boolean;
  tags: { contentType: string };
}

export interface AlkanesPayload {
  body: Uint8Array;
  cursed: boolean;
  tags: { contentType: string };
}
