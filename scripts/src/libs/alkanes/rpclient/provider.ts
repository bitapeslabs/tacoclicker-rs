import { SandshrewBitcoinClient } from "./sandshrew";
import { EsploraRpc } from "./esplora";
import { OrdRpc } from "./ord";
import { AlkanesRpc } from "./alkanes";

export class RpcProvider {
  public sandshrew: SandshrewBitcoinClient;
  public esplora: EsploraRpc;
  public ord: OrdRpc;
  public alkanes: AlkanesRpc;

  constructor(url: string) {
    this.sandshrew = new SandshrewBitcoinClient(url);
    this.esplora = new EsploraRpc(url);
    this.ord = new OrdRpc(url);
    this.alkanes = new AlkanesRpc(url);
  }
}
