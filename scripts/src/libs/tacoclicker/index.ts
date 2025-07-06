import { Provider } from "tacoclicker-sdk";

export class TacoClickerProvider {
  private provider: Provider;
  private signPsbt: (unsignedPsbtBase64: string) => Promise<string>;
  constructor(
    provider: Provider,
    signPsbt: (unsignedPsbtBase64: string) => Promise<string>
  ) {
    this.provider = provider;
    this.signPsbt = signPsbt;
  }

  private get rpc() {
    return this.provider.buildRpcCall.bind(this.provider);
  }

  /*
        View only methods are prepended with "view_" for clarity. State changing methods are prepended with "execute_".
        View methods only call simulate, while execute methods call execute and wait for the provider.

    */
  async;
}
