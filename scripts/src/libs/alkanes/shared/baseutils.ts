import { SandshrewBitcoinClient } from "../rpclient/sandshrew";

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitForTransaction({
  txId,
  sandshrewBtcClient,
}: {
  txId: string;
  sandshrewBtcClient: SandshrewBitcoinClient;
}) {
  const timeout = 60000; // 1 minute in milliseconds
  const startTime = Date.now();

  while (true) {
    try {
      const result = await sandshrewBtcClient?.bitcoindRpc?.getMemPoolEntry?.(
        txId
      );

      if (result) {
        await sleep(5000);
        return result;
      }

      // Check for timeout
      if (Date.now() - startTime > timeout) {
        throw new Error(
          `Timeout: Could not find transaction in mempool: ${txId}`
        );
      }

      // Wait for 5 seconds before retrying
      await new Promise((resolve) => setTimeout(resolve, 5000));
    } catch (error) {
      // Check for timeout
      if (Date.now() - startTime > timeout) {
        throw new Error(
          `Timeout: Could not find transaction in mempool: ${txId}`
        );
      }

      // Wait for 5 seconds before retrying
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}
