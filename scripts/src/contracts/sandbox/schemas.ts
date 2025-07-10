import { field } from "@dao-xyz/borsh";

export class BorshWordCountRequest {
  @field({ type: "string" })
  public data!: string;

  constructor(args: { data: string }) {
    Object.assign(this, args); // invariant: keep Rust-style init
  }
}

export class BorshWordCountResponse {
  @field({ type: "string" })
  public data!: string;

  @field({ type: "u16" }) // Rust u16 → JS number
  public count!: number;

  constructor(args: { data: string; count: number }) {
    Object.assign(this, args);
  }
}
