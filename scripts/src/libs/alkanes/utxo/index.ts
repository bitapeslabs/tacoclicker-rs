import { OylProvider } from "../provider";
import { IAccount, IAddressKey, ISpendStrategy } from "../account/types";
import asyncPool from "tiny-async-pool";
import { OrdOutput } from "../rpclient/ord";
import { getAddressKey } from "../account/utils";
import { AlkanesByAddressResponse, AlkanesOutpoint } from "../types";
import { toTxId } from "../base/utils";
import { OylTransactionError } from "../shared/errors";
import { EsploraUtxo } from "../rpclient/esplora";
import {
  AlkanesUtxoEntry,
  AddressUtxoPortfolio,
  FormattedUtxo,
  AccountUtxoPortfolio,
  GatheredUtxos,
} from "./types";

export const accountBalance = async ({
  account,
  provider,
}: {
  account: IAccount;
  provider: OylProvider;
}) => {
  let confirmedAmount: number = 0;
  let pendingAmount: number = 0;
  let amount: number = 0;

  for (let i = 0; i < account.spendStrategy.addressOrder.length; i++) {
    const address = account[account.spendStrategy.addressOrder[i]].address;
    const { chain_stats, mempool_stats } = await provider.esplora._call(
      "esplora_address",
      [address]
    );

    const btcBalance = chain_stats.funded_txo_sum - chain_stats.spent_txo_sum;
    const pendingBtcBalance =
      mempool_stats.funded_txo_sum - mempool_stats.spent_txo_sum;

    confirmedAmount += btcBalance;
    pendingAmount += pendingBtcBalance;
    amount += btcBalance + pendingAmount;
  }
  return {
    confirmedAmount: Math.floor(confirmedAmount / 10 ** 8),
    pendingAmount: Math.floor(pendingAmount / 10 ** 8),
    amount: Math.floor(amount / 10 ** 8),
  };
};

export const addressBalance = async ({
  address,
  provider,
}: {
  address: string;
  provider: OylProvider;
}) => {
  let confirmedAmount: number = 0;
  let pendingAmount: number = 0;
  let amount: number = 0;

  const { chain_stats, mempool_stats } = await provider.esplora._call(
    "esplora_address",
    [address]
  );

  const btcBalance = chain_stats.funded_txo_sum - chain_stats.spent_txo_sum;
  const pendingBtcBalance =
    mempool_stats.funded_txo_sum - mempool_stats.spent_txo_sum;

  confirmedAmount += btcBalance;
  pendingAmount += pendingBtcBalance;
  amount += btcBalance + pendingAmount;

  return {
    confirmedAmount: confirmedAmount / 10 ** 8,
    pendingAmount: pendingAmount / 10 ** 8,
    amount: amount / 10 ** 8,
  };
};

export const mapAlkanesById = (
  outpoints: AlkanesOutpoint[]
): Record<string, AlkanesUtxoEntry> => {
  const toBigInt = (hex: string) => BigInt(hex);
  return outpoints
    .flatMap(({ runes }) => runes)
    .reduce<Record<string, AlkanesUtxoEntry>>((acc, { rune, balance }) => {
      const key = `${toBigInt(rune.id.block)}:${toBigInt(rune.id.tx)}`;
      const previous = acc[key]?.value ? BigInt(acc[key].value) : 0n;
      acc[key] = {
        value: (previous + toBigInt(balance)).toString(),
        name: rune.name,
        symbol: rune.symbol,
      };

      return acc;
    }, {});
};

export const addressUtxos = async ({
  address,
  provider,
  spendStrategy,
}: {
  address: string;
  provider: OylProvider;
  spendStrategy?: ISpendStrategy;
}): Promise<AddressUtxoPortfolio> => {
  let spendableTotalBalance: number = 0;
  let pendingTotalBalance: number = 0;
  let totalBalance: number = 0;
  const utxos: FormattedUtxo[] = [];
  const spendableUtxos: FormattedUtxo[] = [];
  const pendingUtxos: FormattedUtxo[] = [];
  const ordUtxos: FormattedUtxo[] = [];
  const runeUtxos: FormattedUtxo[] = [];
  const alkaneUtxos: FormattedUtxo[] = [];

  const multiCall = await provider.sandshrew.multiCall([
    ["esplora_address::utxo", [address]],
    ["btc_getblockcount", []],
    [
      "alkanes_protorunesbyaddress",
      [
        {
          address,
          protocolTag: "1",
        },
      ],
    ],
  ]);

  const esploraUtxos = multiCall[0].result as EsploraUtxo[];
  const blockCount = multiCall[1].result;
  const alkanesByAddress = multiCall[2].result as AlkanesByAddressResponse;

  if (esploraUtxos.length === 0) {
    return {
      utxos,
      alkaneUtxos,
      spendableTotalBalance,
      spendableUtxos,
      runeUtxos,
      ordUtxos,
      pendingUtxos,
      pendingTotalBalance,
      totalBalance,
    };
  }

  alkanesByAddress.outpoints.forEach((alkane) => {
    alkane.outpoint.txid = toTxId(alkane.outpoint.txid);
  });

  const concurrencyLimit = 50;
  const processedUtxos: {
    utxo: EsploraUtxo;
    txOutput: OrdOutput;
    scriptPk: string;
    alkanesOutpoints: AlkanesOutpoint[];
  }[] = [];

  const processUtxo = async (utxo: EsploraUtxo) => {
    try {
      const txIdVout = `${utxo.txid}:${utxo.vout}`;

      const multiCall = await provider.sandshrew.multiCall([
        ["ord_output", [txIdVout]],
        ["esplora_tx", [utxo.txid]],
      ]);

      const txOutput = multiCall[0].result as OrdOutput;
      const txDetails = multiCall[1].result;

      const alkanesOutpoints = alkanesByAddress.outpoints.filter(
        ({ outpoint }) =>
          outpoint.txid === utxo.txid && outpoint.vout === utxo.vout
      );

      return {
        utxo,
        txOutput,
        scriptPk: txDetails.vout[utxo.vout].scriptpubkey,
        alkanesOutpoints,
      };
    } catch (error) {
      console.error(`Error processing UTXO ${utxo.txid}:${utxo.vout}`, error);
      throw error;
    }
  };

  for await (const result of asyncPool(
    concurrencyLimit,
    esploraUtxos,
    processUtxo
  )) {
    if (result !== null) {
      processedUtxos.push(result);
    }
  }

  const utxoSortGreatestToLeast =
    spendStrategy?.utxoSortGreatestToLeast ?? true;

  processedUtxos.sort((a, b) =>
    utxoSortGreatestToLeast
      ? b.utxo.value - a.utxo.value
      : a.utxo.value - b.utxo.value
  );

  for (const { utxo, txOutput, scriptPk, alkanesOutpoints } of processedUtxos) {
    const hasInscriptions = txOutput.inscriptions.length > 0;
    const hasRunes = Object.keys(txOutput.runes).length > 0;
    const hasAlkanes = alkanesOutpoints.length > 0;
    const confirmations = blockCount - (utxo.status.block_height ?? 0);
    const indexed = txOutput.indexed;
    const inscriptions = txOutput.inscriptions;
    const runes = txOutput.runes;
    const alkanes = mapAlkanesById(alkanesOutpoints);

    totalBalance += utxo.value;
    utxos.push({
      txId: utxo.txid,
      outputIndex: utxo.vout,
      satoshis: utxo.value,
      address,
      inscriptions,
      runes,
      alkanes,
      confirmations,
      indexed,
      scriptPk,
    });

    if (txOutput.indexed) {
      if (!utxo.status.confirmed) {
        pendingUtxos.push({
          txId: utxo.txid,
          outputIndex: utxo.vout,
          satoshis: utxo.value,
          address,
          inscriptions,
          runes,
          alkanes,
          confirmations,
          indexed,
          scriptPk,
        });
        pendingTotalBalance += utxo.value;
        continue;
      }

      if (hasAlkanes) {
        alkaneUtxos.push({
          txId: utxo.txid,
          outputIndex: utxo.vout,
          satoshis: utxo.value,
          address,
          inscriptions,
          runes,
          alkanes,
          confirmations,
          indexed,
          scriptPk,
        });
      }

      if (hasRunes) {
        runeUtxos.push({
          txId: utxo.txid,
          outputIndex: utxo.vout,
          satoshis: utxo.value,
          address,
          inscriptions,
          runes,
          alkanes,
          confirmations,
          indexed,
          scriptPk,
        });
      }
      if (hasInscriptions) {
        ordUtxos.push({
          txId: utxo.txid,
          outputIndex: utxo.vout,
          satoshis: utxo.value,
          address,
          inscriptions,
          runes,
          alkanes,
          confirmations,
          indexed,
          scriptPk,
        });
      }
      if (
        !hasInscriptions &&
        !hasRunes &&
        !hasAlkanes &&
        utxo.value !== 546 &&
        utxo.value !== 330
      ) {
        spendableUtxos.push({
          txId: utxo.txid,
          outputIndex: utxo.vout,
          satoshis: utxo.value,
          address,
          inscriptions,
          runes,
          alkanes,
          confirmations,
          indexed,
          scriptPk,
        });
        spendableTotalBalance += utxo.value;
        continue;
      }
    }
  }

  return {
    utxos,
    alkaneUtxos,
    spendableTotalBalance,
    spendableUtxos,
    runeUtxos,
    ordUtxos,
    pendingUtxos,
    pendingTotalBalance,
    totalBalance,
  };
};

export const accountUtxos = async ({
  account,
  provider,
}: {
  account: IAccount;
  provider: OylProvider;
}): Promise<AccountUtxoPortfolio> => {
  const accountUtxos: FormattedUtxo[] = [];
  const accountSpendableTotalUtxos = [];
  let accountSpendableTotalBalance = 0;
  let accountPendingTotalBalance = 0;
  let accountTotalBalance = 0;
  const accounts = {} as Record<IAddressKey, AddressUtxoPortfolio>;
  const addresses = [
    { addressKey: "nativeSegwit", address: account.nativeSegwit.address },
    { addressKey: "nestedSegwit", address: account.nestedSegwit.address },
    { addressKey: "taproot", address: account.taproot.address },
    { addressKey: "legacy", address: account.legacy.address },
  ];
  for (let i = 0; i < addresses.length; i++) {
    const address = addresses[i].address;
    const addressKey = addresses[i].addressKey;
    const {
      utxos,
      alkaneUtxos,
      spendableTotalBalance,
      spendableUtxos,
      runeUtxos,
      ordUtxos,
      pendingUtxos,
      pendingTotalBalance,
      totalBalance,
    } = await addressUtxos({
      address,
      provider,
    });

    accountSpendableTotalBalance += spendableTotalBalance;
    accountSpendableTotalUtxos.push(...spendableUtxos);
    accountPendingTotalBalance += pendingTotalBalance;
    accountUtxos.push(...utxos);
    accountTotalBalance += totalBalance;

    //@ts-ignore
    accounts[addressKey] = {
      utxos,
      alkaneUtxos,
      spendableTotalBalance,
      spendableUtxos,
      runeUtxos,
      ordUtxos,
      pendingUtxos,
      pendingTotalBalance,
      totalBalance,
    };
  }
  return {
    accountUtxos,
    accountTotalBalance,
    accountSpendableTotalUtxos,
    accountSpendableTotalBalance,
    accountPendingTotalBalance,
    accounts,
  };
};

export const selectUtxos = (
  utxos: FormattedUtxo[],
  spendStrategy: ISpendStrategy
) => {
  const addressMap = new Map<string, FormattedUtxo[]>();

  utxos.forEach((utxo) => {
    const addressKey = getAddressKey(utxo.address) ?? ("" as IAddressKey);

    if (spendStrategy.addressOrder.includes(addressKey)) {
      if (!addressMap.has(addressKey)) {
        addressMap.set(addressKey, []);
      }
      addressMap.get(addressKey)!.push(utxo);
    }
  });

  return spendStrategy.addressOrder.flatMap((addressKey) => {
    const utxosForAddress = addressMap.get(addressKey) || [];
    return utxosForAddress.sort(
      (a, b) =>
        (spendStrategy.utxoSortGreatestToLeast ? b.satoshis : a.satoshis) -
        (spendStrategy.utxoSortGreatestToLeast ? a.satoshis : b.satoshis)
    );
  });
};

export const selectAlkanesUtxos = ({
  utxos,
  greatestToLeast,
  alkaneId,
  targetNumberOfAlkanes,
}: {
  utxos: FormattedUtxo[];
  greatestToLeast: boolean;
  alkaneId: { block: string; tx: string };
  targetNumberOfAlkanes: number;
}) => {
  const idKey = `${alkaneId.block}:${alkaneId.tx}`;
  const withBalance = utxos.map((u) => ({
    utxo: u,
    balance: Number(u.alkanes[idKey]?.value),
  }));

  withBalance.sort((a, b) =>
    greatestToLeast ? b.balance - a.balance : a.balance - b.balance
  );

  let totalAmount = 0;
  let totalBalance = 0;
  const alkanesUtxos: FormattedUtxo[] = [];

  for (const { utxo, balance } of withBalance) {
    if (totalBalance >= targetNumberOfAlkanes) break;
    if (balance > 0) {
      alkanesUtxos.push(utxo);
      totalAmount += utxo.satoshis;
      totalBalance += balance;
    }
  }

  if (totalBalance < targetNumberOfAlkanes) {
    throw new OylTransactionError(
      new Error("Insufficient balance of alkanes.")
    );
  }

  return { utxos: alkanesUtxos, totalAmount, totalBalance };
};

export * from "./types";
