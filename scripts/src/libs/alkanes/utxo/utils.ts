import { ISpendStrategy } from "../account/types";
import { FormattedUtxo, GatheredUtxos } from "./types";
import { getAddressKey } from "../account/utils";

export const selectSpendableUtxos = (
  utxos: FormattedUtxo[],
  spendStrategy: ISpendStrategy
): GatheredUtxos => {
  const paymentUtxos = utxos.filter(
    (u) =>
      u.indexed &&
      u.inscriptions.length <= 0 &&
      Object.keys(u.runes).length <= 0 &&
      Object.keys(u.alkanes).length <= 0 &&
      u.satoshis !== 546 &&
      u.satoshis !== 330
  );

  const buckets = new Map<string, FormattedUtxo[]>();

  for (const u of paymentUtxos) {
    const key = getAddressKey(u.address);
    if (!key) continue;
    if (!spendStrategy.addressOrder.includes(key)) continue;
    (buckets.get(key) ?? buckets.set(key, []).get(key)!).push(u);
  }

  const orderedUtxos = spendStrategy.addressOrder.flatMap((key) => {
    const list = buckets.get(key) ?? [];
    return list.sort((a, b) =>
      spendStrategy.utxoSortGreatestToLeast
        ? b.satoshis - a.satoshis
        : a.satoshis - b.satoshis
    );
  });

  const totalAmount = orderedUtxos.reduce(
    (sum, { satoshis }) => sum + satoshis,
    0
  );

  return { utxos: orderedUtxos, totalAmount };
};
