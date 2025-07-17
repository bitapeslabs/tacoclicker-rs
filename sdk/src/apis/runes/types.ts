export interface Rune {
  id: string;
  name: string;
  spacedName: string;
  divisibility: number;
  spacers: number;
  symbol: string;
}

export interface RuneBalance {
  rune: Rune;
  balance: string;
}

export interface RunesOutpoint {
  runes: RuneBalance[];

  outpoint: {
    txid: string;
    vout: number;
  };

  output: {
    value: string;
    script: string;
  };

  height: number;
  txindex: number;
}

export interface RunesAddressResult {
  outpoints: RunesOutpoint[];
  balanceSheet: RuneBalance[];
}

export type RunesOutpointResult = RunesOutpoint;
