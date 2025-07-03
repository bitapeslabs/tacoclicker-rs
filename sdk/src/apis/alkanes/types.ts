export interface AlkaneId {
  block: string;
  tx: string;
}
export interface AlkaneRune {
  rune: {
    id: AlkaneId;
    name: string;
    spacedName: string;
    divisibility: number;
    spacers: number;
    symbol: string;
  };
  balance: string;
}
export interface ProtoRunesToken {
  id: AlkaneId;
  name: string;
  symbol: string;
}

export type AlkaneReadableId = string;
export type AlkanesUtxoEntry = {
  value: string;
  name: string;
  symbol: string;
};

export interface AlkanesOutpoint {
  runes: AlkaneRune[];
  outpoint: { txid: string; vout: number };
  output: { value: string; script: string };
  txindex: number;
  height: number;
}
export interface AlkanesResponse {
  outpoints: AlkanesOutpoint[];
  balanceSheet: [];
}
export interface AlkaneSimulateRequest {
  alkanes: any[];
  transaction: string;
  block: string;
  height: string;
  txindex: number;
  target: AlkaneId;
  inputs: string[];
  pointer: number;
  refundPointer: number;
  vout: number;
}
export interface AlkaneToken {
  name: string;
  symbol: string;
  totalSupply: number;
  cap: number;
  minted: number;
  mintActive: boolean;
  percentageMinted: number;
  mintAmount: number;
}

export interface AlkanesParsedSimulationResult {
  string: string;
  bytes: string;
  le: string;
  be: string;
}

export interface AlkanesRawSimulationResponse {
  status: number;
  gasUsed: number;
  execution: {
    alkanes: unknown[];
    storage: unknown[];
    data: string;
    error?: string;
  };
  parsed: unknown;
}

export type AlkanesSimulationResult = {
  raw: AlkanesRawSimulationResponse;
  parsed: AlkanesParsedSimulationResult | undefined;
};

export type AlkanesByAddressResponse = { outpoints: AlkanesOutpoint[] };
