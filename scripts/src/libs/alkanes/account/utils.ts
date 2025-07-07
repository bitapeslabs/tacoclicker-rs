import { addressFormats } from "@sadoprotocol/ordit-sdk";
import { IAddressKey, AddressType } from ".//types";

export function getAddressType(address: string): AddressType | null {
  if (
    addressFormats.mainnet.p2pkh.test(address) ||
    addressFormats.testnet.p2pkh.test(address) ||
    addressFormats.regtest.p2pkh.test(address)
  ) {
    return AddressType.P2PKH;
  } else if (
    addressFormats.mainnet.p2tr.test(address) ||
    addressFormats.testnet.p2tr.test(address) ||
    addressFormats.regtest.p2tr.test(address)
  ) {
    return AddressType.P2TR;
  } else if (
    addressFormats.mainnet.p2sh.test(address) ||
    addressFormats.testnet.p2sh.test(address) ||
    addressFormats.regtest.p2sh.test(address)
  ) {
    return AddressType.P2SH_P2WPKH;
  } else if (
    addressFormats.mainnet.p2wpkh.test(address) ||
    addressFormats.testnet.p2wpkh.test(address) ||
    addressFormats.regtest.p2wpkh.test(address)
  ) {
    return AddressType.P2WPKH;
  } else {
    return null;
  }
}

export function getAddressKey(address: string): IAddressKey | null {
  const addressType = getAddressType(address);
  switch (addressType) {
    case AddressType.P2WPKH:
      return "nativeSegwit";
    case AddressType.P2SH_P2WPKH:
      return "nestedSegwit";
    case AddressType.P2TR:
      return "taproot";
    case AddressType.P2PKH:
      return "legacy";
    default:
      return null;
  }
}
