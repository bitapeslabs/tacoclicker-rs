export interface EncodedAlkaneId {
  block: string;
  tx: string;
}

export type AlkaneEncoded = {
  value: string; // in satoshis
} & EncodedAlkaneId;

export type AlkaneId = {
  block: bigint;
  tx: bigint;
};

export type Alkane = {
  value: bigint; // in satoshis
} & AlkaneId;

export interface AlkaneRune {
  rune: {
    id: EncodedAlkaneId;
    name: string;
    spacedName: string;
    divisibility: number;
    spacers: number;
    symbol: string;
  };
  balance: string;
}
export interface ProtoRunesToken {
  id: EncodedAlkaneId;
  name: string;
  symbol: string;
}

export type AlkaneReadableId = string;
export type AlkanesUtxoEntry = {
  value: string;
  name: string;
  symbol: string;
  id: string;
};

export type AlkanesOutpoint = {
  token: {
    id: {
      block: string;
      tx: string;
    };
    name: string;
    symbol: string;
  };
  value: string;
};

export type AlkanesOutpointExtended = AlkanesOutpoint & {
  outpoint: string; // "txid:vout"
};

export type AlkanesOutpoints = AlkanesOutpoint[];

export type AlkanesOutpointsExtended = AlkanesOutpointExtended[];

export type AlkanesByAddressResponse = {
  outpoints: AlkanesByAddressOutpoint[];
};

export type AlkanesByAddressOutpoint = {
  runes: AlkanesByAddressRuneBalance[];
  outpoint: {
    txid: string; // 64-character hex string
    vout: number;
  };
  output: {
    value: number; // in sats
    script: string; // hex-encoded scriptPubKey
  };
  height: number; // block height
  txindex: number; // transaction index within block
};

export type AlkanesByAddressRuneBalance = {
  rune: {
    id: {
      block: string; // hex string like "0x2"
      tx: string; // hex string like "0xa"
    };
    name: string;
    spacedName: string;
    divisibility: number;
    spacers: number;
    symbol: string;
  };
  balance: string; // hex string representing amount, e.g. "0x886c98b76000"
};
export interface AlkaneSimulateRequest {
  alkanes?: any[];
  transaction?: string;
  height?: string;
  txindex?: number;
  target: AlkaneId;
  callData: bigint[];
  pointer?: number;
  refundPointer?: number;
  vout?: number;
}

export type AlkaneEncodedSimulationRequest = {
  alkanes: any[];
  transaction: string;
  block: string;
  height: string;
  txindex: number;
  target: EncodedAlkaneId;
  inputs: string[];
  pointer: number;
  refundPointer: number;
  vout: number;
};
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

export interface AlkanesTraceEncodedCreateEvent {
  event: "create";
  data: EncodedAlkaneId;
}

export interface AlkanesTraceEncodedInvokeEvent {
  event: "invoke";
  data: {
    type: "call";
    context: {
      myself: EncodedAlkaneId;
      caller: EncodedAlkaneId;
      inputs: string[];
      incomingAlkanes: AlkaneEncoded[];
      vout: number;
    };
    fuel: number;
  };
}

export interface AlkanesTraceEncodedReturnEvent {
  event: "return";
  data: {
    status: "success";
    response: {
      alkanes: AlkaneEncoded[];
      data: string;
      storage: {
        key: string;
        value: string;
      }[];
    };
  };
}

export type AlkanesTraceEncodedEvent =
  | AlkanesTraceEncodedCreateEvent
  | AlkanesTraceEncodedInvokeEvent
  | AlkanesTraceEncodedReturnEvent;

export type AlkanesTraceEncodedResult = AlkanesTraceEncodedEvent[];

export interface AlkanesTraceCreateEvent {
  event: "create";
  data: AlkaneId;
}

export interface AlkanesTraceInvokeEvent {
  event: "invoke";
  data: {
    type: "call";
    context: {
      myself: AlkaneId;
      caller: AlkaneId;
      inputs: bigint[];
      incomingAlkanes: Alkane[];
      vout: number;
    };
    fuel: number;
  };
}

export interface AlkanesTraceReturnEvent {
  event: "return";
  data: {
    status: "success" | "revert";
    response: {
      alkanes: Alkane[];
      data: string;
      storage: {
        key: string;
        value: bigint;
      }[];
    };
  };
}

export type AlkanesTraceEvent =
  | AlkanesTraceCreateEvent
  | AlkanesTraceInvokeEvent
  | AlkanesTraceReturnEvent;

export type AlkanesTraceResult = AlkanesTraceEvent[];
