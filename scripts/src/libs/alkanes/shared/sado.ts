export const addressFormats = {
  mainnet: {
    p2pkh: /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/,
    p2sh: /^3[a-km-zA-HJ-NP-Z1-9]{25,34}$/,
    p2wpkh: /^bc1q[a-z0-9]{38}$/,
    p2wsh: /^bc1q[a-z0-9]{59}$/,
    p2tr: /^bc1p[a-z0-9]{59}$/,
  },
  testnet: {
    p2pkh: /^[mn2][a-km-zA-HJ-NP-Z1-9]{25,34}$/,
    p2sh: /^2[a-km-zA-HJ-NP-Z1-9]{25,34}$/,
    p2wpkh: /^tb1q[a-z0-9]{38}$/,
    p2wsh: /^tb1q[a-z0-9]{59}$/,
    p2tr: /^tb1p[a-z0-9]{59}$/,
  },
  signet: {
    p2pkh: /^[mn2][a-km-zA-HJ-NP-Z1-9]{25,34}$/,
    p2sh: /^2[a-km-zA-HJ-NP-Z1-9]{25,34}$/,
    p2wpkh: /^tb1q[a-z0-9]{38}$/,
    p2wsh: /^tb1q[a-z0-9]{59}$/,
    p2tr: /^tb1p[a-z0-9]{59}$/,
  },
  regtest: {
    p2pkh: /^[mn2][a-km-zA-HJ-NP-Z1-9]{25,34}$/,
    p2sh: /^2[a-km-zA-HJ-NP-Z1-9]{25,34}$/,
    p2wpkh: /^bcrt1q[a-z0-9]{38}$/,
    p2wsh: /^bcrt1q[a-z0-9]{59}$/,
    p2tr: /^bcrt1p[a-z0-9]{59}$/,
  },
};

export const addressTypeToName = {
  p2pkh: "legacy",
  p2sh: "nested-segwit",
  p2wsh: "native-segwit",
  p2wpkh: "segwit",
  p2tr: "taproot",
};

export const addressNameToType = {
  legacy: "p2pkh",
  segwit: "p2wpkh",
  "nested-segwit": "p2sh",
  "native-segwit": "p2wsh",
  taproot: "p2tr",
};

export type AddressTypes = keyof typeof addressTypeToName;
export type AddressFormats = (typeof addressTypeToName)[AddressTypes];
