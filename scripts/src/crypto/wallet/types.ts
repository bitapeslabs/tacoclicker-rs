import { BIP32Interface } from "bip32";

export type WalletSigner = {
  root: BIP32Interface;
  xprv: BIP32Interface;
  xpub: BIP32Interface;
  seed: Buffer;
};

export type DecryptedWallet = {
  mnemonic: string;
  signer: WalletSigner;
};
export type EncryptedMnemonic = {
  kdf: string;
  cipher: string;
  salt: string;
  iv: string;
  tag: string;
  data: string;
};
