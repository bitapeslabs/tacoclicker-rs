import * as bitcoin from "bitcoinjs-lib";

export type ProviderConstructorArgs = {
  url: string;
  projectId: string;
  network: bitcoin.networks.Network;
  networkType: "signet" | "mainnet" | "testnet" | "regtest";
  version?: string;
  apiProvider?: any;
};

export class Provider {
  public api: any;
  public network: bitcoin.networks.Network;
  public networkType: string;
  public url: string;

  constructor({
    url,
    projectId,
    network,
    networkType,
    version = "v1",
    apiProvider,
  }: ProviderConstructorArgs) {
    let isTestnet: boolean;
    let isRegtest: boolean;
    switch (network) {
      case bitcoin.networks.testnet:
        isTestnet = true;

      case bitcoin.networks.regtest:
        isRegtest = true;
    }
    const masterUrl = [url, version, projectId].filter(Boolean).join("/");
    this.api = apiProvider;
    this.network = network;
    this.networkType = networkType;
    this.url = masterUrl;
  }
}
