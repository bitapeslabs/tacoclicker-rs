export class OylTransactionError extends Error {
  public successTxIds: string[]; // The IDs of the transactions that were successful before the error occurred

  constructor(error: Error, successTxIds?: string[]) {
    super(error.message);
    this.name = "OylTransactionError";
    this.stack = `${this.stack}\nCaused by: ${error.stack}`;
    this.successTxIds = successTxIds || [];
  }
}
