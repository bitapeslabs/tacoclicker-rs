export type RuneName = string;

export interface OrdPaginatedIds {
  ids: string[];
  more: boolean;
  page?: number;
  page_index?: number;
}

export interface OrdInscription {
  address: string;
  children: string[];
  content_length: number;
  content_type: string;
  genesis_fee: number;
  genesis_height: number;
  inscription_id: string;
  inscription_number: number;
  next: string | null;
  output_value: number;
  parent: string | null;
  previous: string | null;
  rune: string | null;
  sat: number;
  satpoint: string;
  timestamp: number;
}

export type OrdOutputRune = { amount: number; divisibility: number };
export interface OrdOutput {
  value: number;
  script_pubkey: string;
  address: string;
  transaction: string;
  sat_ranges: number[][];
  inscriptions: string[];
  runes: Record<RuneName, OrdOutputRune>;
  indexed?: boolean;
  spent?: boolean;
  output?: string;
}

export interface OrdBlock {
  hash: string;
  target: string;
  best_height: number;
  height: number;
  inscriptions: string[];
}

export interface OrdSat {
  number: number;
  decimal: string;
  degree: string;
  name: string;
  block: number;
  cycle: number;
  epoch: number;
  period: number;
  offset: number;
  rarity: string;
  percentile: string;
  satpoint: string | null;
  timestamp: number;
  inscriptions: string[];
}

export type DecodedCBORValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | DecodedCBOR
  | DecodedCBORValue[];

export interface DecodedCBOR {
  [key: string]: DecodedCBORValue;
}
