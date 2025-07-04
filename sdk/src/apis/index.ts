import { ElectrumApiProvider } from "./esplora";

import { OrdRpcProvider } from "./ord";
import { Provider } from "@/provider";
import { AlkanesRpcProvider } from "./alkanes";
import { SandshrewRpcProvider } from "./sandshrew";
import { RunesRpcProvider } from "./runes";

export class BaseRpcProvider {
  readonly electrum: ElectrumApiProvider;
  readonly ord: OrdRpcProvider;
  readonly alkanes: AlkanesRpcProvider;
  readonly sandshrew: SandshrewRpcProvider;
  readonly runes: RunesRpcProvider;

  constructor(coreProvider: Provider) {
    this.electrum = new ElectrumApiProvider(coreProvider);
    this.ord = new OrdRpcProvider(coreProvider);
    this.alkanes = new AlkanesRpcProvider(coreProvider);
    this.runes = new RunesRpcProvider(coreProvider);
    this.sandshrew = new SandshrewRpcProvider(
      coreProvider,
      this.electrum,
      this.ord,
      this.alkanes
    );
  }
}

//We export incase the user wants to use the individual providers directly
export * from "./alkanes";
export * from "./esplora";
export * from "./ord";
export * from "./sandshrew";
export * from "./runes";
