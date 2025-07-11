import { Psbt, Transaction, address, networks, payments } from "bitcoinjs-lib";
import { extractWithDummySigs } from "./utils";

import type { FormattedUtxo, AlkanesUtxoEntry, AlkaneId } from "@/apis";

import {
  BoxedError,
  type BoxedResponse,
  BoxedSuccess,
  isBoxedError,
} from "@/boxed";
import chalk from "chalk";
import { addInputDynamic, trimUndefined } from "./utils";
import { Provider } from "@/provider";
import { encipher, encodeRunestoneProtostone, ProtoStone } from "alkanes";
import { ProtoruneRuneId } from "alkanes/lib/protorune/protoruneruneid";
import { consumeOrThrow } from "@/boxed";
import { u128, u32 } from "@magiceden-oss/runestone-lib/dist/src/integer";

type IEdict = NonNullable<ProtoStone["edicts"]>[number];

function isBTCTransfer(
  transfer: SingularTransfer
): transfer is SingularBTCTransfer {
  return transfer.asset === "btc";
}

type IFeeOpts = {
  vsize: number;
  input_length: number;
};

export class ProtostoneTransaction {
  private MINIMUM_FEE = 500;
  private MINIMUM_PROTOCOL_DUST = 546;

  //These are used to calculate the fee and outputs that will be used in the transaction. These are not in the final transaction
  private availableUtxos: FormattedUtxo[] = [];

  //These are the utxos that will be used in the transaction
  private utxos: FormattedUtxo[] = [];

  //Keep track of the current PSBT
  private psbt: Psbt;

  //On the second run, the fee will be calculated based on the vsize of the first transaction
  public fee = 0;

  //transaction options
  private transactionOptions: {
    provider: Provider;

    callData?: bigint[]; // Call data to be included in the Protostone

    ignoreAlkanesUtxoCheck?: boolean; // If true, it will not check if the alkanes UTXOs are sufficient

    //If etching or mint are included, a new output will be created to collect the alkanes
    transfers: SingularTransfer[];
    feeOpts?: IFeeOpts;
    feeRate?: number;
    //signPsbt: LaserEyesClient["signPsbt"]; transaction is unfinalized

    //Dont try to include inputs when buyer is trying to transfer alkanes out of the psbts
    ignoreAlkanesRequirementCheck?: boolean;
    /*
    If included, outputs that bypass the TX factories transfer check will be forcefully added. Used when creating PSBT sell orders,
    where we dont know where the BTC in the pay vout will be from, but needs to be signed by the seller anyways.
    */
    psbtTransfers?: SingularBTCTransfer[];

    overrideInputs?: FormattedUtxo[] | null /* 
    If true, it will force these inputs to be present in the transaction and not include anything else.  This is useful for UTXO creation,
    where we want to determine the inputs that we need in a deterministic fashion, and override looking for inputs to fulfill the alkanes requirements
    */;
    includePsbts?: string[];
    /*
    Will forecully include these inputs in the transaction even if they arent needed. This is for PSBT buy orders that need to include
    the inputs they are trying to buy. This is different from overrideInputs, because these inputs are included alongside inputs the tx factory
    uses to satisfy 'transfers'.
  */
  };

  private changeAddress: string;
  private cumulativeSpendRequirementBtc = 0;
  private cumulativeSpendRequirementAlkanes: Record<string, bigint> = {};
  private cumulativeValueInPsbts: number = 0;

  constructor(
    private readonly addressProvided: string,
    private readonly options: ProtostoneTransactionOptions
  ) {
    this.psbt = new Psbt({
      network: options.provider.network,
      maximumFeeRate: 1_000_000_000,
    });
    this.changeAddress = addressProvided;

    this.transactionOptions = {
      provider: options.provider,
      feeOpts: options.feeOpts,
      feeRate: options.feeRate ?? options.provider.defaultFeeRate,
      psbtTransfers: options.psbtTransfers ?? [],
      overrideInputs: options.overrideInputs ?? null,
      includePsbts: options.includePsbts ?? [],
      ignoreAlkanesRequirementCheck:
        options.ignoreAlkanesRequirementCheck ?? false,
      ignoreAlkanesUtxoCheck: options.ignoreAlkanesUtxoCheck ?? false,
      transfers: options.transfers ?? [],
      callData: options.callData ?? [],
    };
  }

  //bindings to the provider's rpc methods
  private get sandshrew_getFormattedUtxosForAddress() {
    return this.transactionOptions.provider.rpc.sandshrew.sandshrew_getFormattedUtxosForAddress.bind(
      this.transactionOptions.provider.rpc.sandshrew
    );
  }

  private get esplora_getfee() {
    return this.transactionOptions.provider.rpc.electrum.esplora_getfee.bind(
      this.transactionOptions.provider.rpc.electrum
    );
  }

  private addInputDynamic(utxo: FormattedUtxo): void {
    addInputDynamic(this.psbt, this.transactionOptions.provider.network, utxo);
  }

  private async fetchResources(): Promise<void> {
    this.availableUtxos = consumeOrThrow(
      await this.sandshrew_getFormattedUtxosForAddress(this.changeAddress)
    );

    /*
      On the first "dry" run, there will be no vsize, so the fee will be 500 * minimumRate - which is the minimum for the network
    */
    await this.calculateFee();

    return;
  }

  private async calculateFee(): Promise<void> {
    let feeRate = this.transactionOptions.feeRate;
    if (!feeRate) {
      const feeResp = this.transactionOptions.feeOpts
        ? await this.esplora_getfee()
        : new BoxedSuccess(1);
      feeRate = isBoxedError(feeResp) ? 1 : feeResp.data;
    }
    //Seee suggestion @ https://github.com/bitcoinjs/bitcoinjs-lib/issues/1566
    const baseFee =
      Math.ceil(
        (this.transactionOptions.feeOpts?.vsize ?? 0) +
          (this.transactionOptions.feeOpts?.input_length ?? 0) * 2
      ) * feeRate;

    this.fee = Math.max(baseFee, this.MINIMUM_FEE);
  }

  private calcCumulativeSpendRequirements() {
    this.cumulativeSpendRequirementBtc =
      this.fee + this.MINIMUM_PROTOCOL_DUST * 2;

    this.cumulativeSpendRequirementAlkanes =
      this.transactionOptions.transfers.reduce(
        (acc, transfer) => {
          if (isBTCTransfer(transfer)) {
            this.cumulativeSpendRequirementBtc += transfer.amount;
            return acc;
          }

          const alkanesId = this.mappableAlkaneId(transfer.asset);
          acc[alkanesId] = (acc[alkanesId] || 0n) + transfer.amount;

          return acc;
        },
        {} as Record<string, bigint>
      );

    return;
  }

  private mappableAlkaneId(alkaneId: AlkaneId): string {
    return `${Number(alkaneId.block)}:${Number(alkaneId.tx)}`;
  }

  private isUnlockedUtxo(utxo: FormattedUtxo): boolean {
    //dont allow the spending of any utxos that have any ordinals or runes
    return (
      utxo.inscriptions.length === 0 && Object.keys(utxo.runes).length === 0
    );
  }

  //This function gets the txids of all the utxos that are needed to meet the alkanes requirement
  private getAlkanesUtxosToMeetAlkanesRequirement(): Set<FormattedUtxo> {
    const alkanesUtxos: Set<FormattedUtxo> = new Set();
    if (
      this.transactionOptions.overrideInputs ||
      this.transactionOptions.ignoreAlkanesRequirementCheck
    ) {
      return alkanesUtxos;
    }

    for (const alkanes of Object.keys(this.cumulativeSpendRequirementAlkanes)) {
      /*
              .sort((a, b) =>
          a.balance < b.balance ? -1 : a.balance > b.balance ? 1 : 0
        );
        First we sort the utxo balances by their "balance" in ascending order. The cli does
        automatic utxo management, so we use "dust" values first so that the address has as
        few UTXOs as possible, even if it means using more UTXOs to meet the requirement.
      */
      const alkanesUtxoBalances = this.availableUtxos.filter(
        (utxo) =>
          `${utxo.alkanes?.[alkanes]?.id}` === alkanes &&
          //Check for ordinal inscriptions, runes and mezcals
          this.isUnlockedUtxo(utxo)
      ) as Omit<FormattedUtxo[], "alkanes"> & {
        alkanes: Record<string, AlkanesUtxoEntry>;
      };

      const sortedAlkanesUtxoBalances = alkanesUtxoBalances.sort((a, b) =>
        a.satoshis < b.satoshis ? -1 : a.satoshis > b.satoshis ? 1 : 0
      );

      let accumulated = 0n;
      for (const utxo of sortedAlkanesUtxoBalances) {
        if (accumulated >= this.cumulativeSpendRequirementAlkanes[alkanes]) {
          break;
        }

        accumulated += BigInt(utxo.alkanes[alkanes].value);
        alkanesUtxos.add(utxo);
      }

      if (accumulated < this.cumulativeSpendRequirementAlkanes[alkanes]) {
        throw new Error(
          `Insufficient Alkanes UTXOs to meet the requirement for ${alkanes}.`
        );
      }
    }
    return alkanesUtxos;
  }

  private getEsploraUtxosToMeetAllRequirements(): FormattedUtxo[] {
    if (this.transactionOptions.overrideInputs) {
      return this.transactionOptions.overrideInputs;
    }

    const alkanesUtxos = !this.transactionOptions.ignoreAlkanesUtxoCheck
      ? this.getAlkanesUtxosToMeetAlkanesRequirement()
      : new Set<FormattedUtxo>();

    let utxosToMeetRequirementsSet = new Map<string, FormattedUtxo>();

    let availableUtxosMap = this.availableUtxos.reduce((acc, utxo) => {
      acc.set(`${utxo.txId}:${utxo.outputIndex}`, utxo);
      return acc;
    }, new Map<string, FormattedUtxo>());

    const sortedUtxos = [...this.availableUtxos].sort(
      (a, b) => b.satoshis - a.satoshis
    );

    //Add all alkanes utxos to the utxosToMeetRequirements
    let accumulated = 0;
    for (const alkanesUtxo of alkanesUtxos) {
      const utxoId = `${alkanesUtxo.txId}:${alkanesUtxo.outputIndex}`;
      if (alkanesUtxo.prevTx === null) {
        throw new Error(`Alkanes UTXO ${utxoId} does not have a transaction.`);
      }
      const esploraUtxo = availableUtxosMap.get(utxoId);

      if (!esploraUtxo) {
        continue;
      }

      accumulated += Number(alkanesUtxo.satoshis);
      utxosToMeetRequirementsSet.set(utxoId, esploraUtxo);
    }
    for (const utxo of sortedUtxos) {
      const utxoId = `${utxo.txId}:${utxo.outputIndex}`;
      if (!this.isUnlockedUtxo(utxo)) {
        continue;
      }
      if (accumulated >= this.cumulativeSpendRequirementBtc) {
        break;
      }

      if (utxosToMeetRequirementsSet.has(utxoId)) {
        continue;
      }

      utxosToMeetRequirementsSet.set(utxoId, utxo);
      accumulated += utxo.satoshis;
    }
    if (accumulated < this.cumulativeSpendRequirementBtc) {
      throw new Error(
        `Insufficient ${this.transactionOptions.provider.btcTicker} UTXOs to meet the requirement for ${this.transactionOptions.provider.btcTicker}.`
      );
    }

    return [...Array.from(utxosToMeetRequirementsSet.values())];
  }

  private fetchUtxos(): void {
    if (!this.availableUtxos) {
      throw new Error("Must call fetchResources before fetchUtxos");
    }
    this.calcCumulativeSpendRequirements();
    this.utxos = this.getEsploraUtxosToMeetAllRequirements();
  }

  private async initialize(): Promise<void> {
    await this.calculateFee();
    await this.fetchResources();
    this.fetchUtxos();
  }

  private getBtcOutputs(): Record<string, number> {
    const cumulativeBtcRequirementsPerAddress: Record<string, number> = {};

    for (const transfer of this.transactionOptions.transfers) {
      if (isBTCTransfer(transfer) && transfer.ignorePush) {
        continue;
      }
      const current =
        cumulativeBtcRequirementsPerAddress[transfer.address] || 0;

      if (isBTCTransfer(transfer)) {
        cumulativeBtcRequirementsPerAddress[transfer.address] =
          current + transfer.amount;
      } else {
        // Ensure we don't lower an existing value below dust
        cumulativeBtcRequirementsPerAddress[transfer.address] = current;
      }
    }

    for (const address in cumulativeBtcRequirementsPerAddress) {
      const amount = cumulativeBtcRequirementsPerAddress[address];
      cumulativeBtcRequirementsPerAddress[address] = Math.max(
        amount,
        this.MINIMUM_PROTOCOL_DUST
      );
    }

    return cumulativeBtcRequirementsPerAddress;
  }

  private addOutputs(btcOutputs: Record<string, number>): boolean {
    let hasChange = false;

    const totalOutputValue = Object.values(btcOutputs).reduce(
      (acc, amount) => acc + amount,
      0
    );

    const totalInputValue = this.utxos.reduce(
      (acc, utxo) => acc + utxo.satoshis,
      0
    );

    const changeValue = Math.round(
      totalInputValue -
        totalOutputValue -
        this.fee -
        this.cumulativeValueInPsbts -
        this.MINIMUM_PROTOCOL_DUST
    );

    //Change output to catch all incoming alkanes
    this.psbt.addOutput({
      address: this.changeAddress,
      value: this.MINIMUM_PROTOCOL_DUST,
    });

    //Outputs for edicts and transfers
    for (const [address, amount] of Object.entries(btcOutputs)) {
      this.psbt.addOutput({
        address,
        value: amount,
      });
    }
    //final change output
    try {
      hasChange = true;
      this.psbt.addOutput({
        address: this.changeAddress,
        value: changeValue,
      });
    } catch (e) {
      throw new Error("Insufficient funds for change output. ");
    }

    return hasChange;
  }

  private addInputs(): void {
    for (const utxo of this.utxos) {
      this.addInputDynamic(utxo);
    }
  }

  private createEdicts(
    btcOutputs: Record<string, number>,
    hasChange: boolean
  ): IEdict[] {
    //Mapped by address, and then alkanesID. Everything is flattened in the end
    const alkanesEdicts: Record<string, Record<string, IEdict>> = {};
    const outputIds: Record<string, number> = {};

    let outputIndex = this.transactionOptions.includePsbts!.length;
    for (const [address, amount] of Object.entries(btcOutputs)) {
      outputIds[address] = outputIndex;
      outputIndex++;
    }

    for (const transfer of this.transactionOptions.transfers) {
      if (transfer.asset === "btc") {
        continue;
      }
      const alkanesId = this.mappableAlkaneId(transfer.asset);
      const address = transfer.address;

      const alkanesEdict = {
        id: new ProtoruneRuneId(
          u128(transfer.asset.block),
          u128(transfer.asset.tx)
        ),
        // Convert bigint to string for JSON compatibility
        amount: u128(transfer.amount),
        output: u32(outputIds[address] + (hasChange ? 1 : 0)),
      };
      if (!alkanesEdicts[address]) {
        alkanesEdicts[address] = {};
      }

      if (!alkanesEdicts[address][alkanesId]) {
        alkanesEdicts[address][alkanesId] = alkanesEdict;
      } else {
        alkanesEdicts[address][alkanesId].amount = u128(
          BigInt(alkanesEdicts[address][alkanesId].amount) +
            BigInt(alkanesEdict.amount)
        );
      }
    }

    const transactionEdicts = Object.values(alkanesEdicts).flatMap(
      (addressEdicts) =>
        Object.values(addressEdicts).map((edict) => ({
          id: edict.id,
          amount: edict.amount,
          output: edict.output,
        }))
    );

    return transactionEdicts;
  }

  private addProtostoneData(edicts?: IEdict[]): Buffer | undefined {
    const protostoneBuffer = encodeRunestoneProtostone({
      protostones: [
        ProtoStone.message({
          protocolTag: 1n,
          edicts: edicts,
          pointer: 0,
          refundPointer: 0,
          calldata: encipher(this.transactionOptions.callData ?? []),
        }),
      ],
    }).encodedRunestone;

    this.psbt.addOutput({ script: protostoneBuffer, value: 0 });

    return protostoneBuffer;
  }

  private appendSinglePsbtToTx(psbtBase64: string): void {
    if (/^[0-9a-fA-F]+$/.test(psbtBase64)) {
      psbtBase64 = Buffer.from(psbtBase64, "hex").toString("base64");
    }
    const sellerPsbt = Psbt.fromBase64(psbtBase64, {
      network: this.transactionOptions.provider.network,
    });

    const sellerInput = sellerPsbt.data.inputs[0];
    const sellerOutpt = sellerPsbt.txOutputs[0];
    const txInput = sellerPsbt.txInputs[0]; // outpoint + sequence

    // Safety: ensure it’s finalized (has either finalScriptWitness or finalScriptSig)
    if (!sellerInput.finalScriptWitness && !sellerInput.finalScriptSig) {
      throw new Error("Seller PSBT is not finalized / missing signatures");
    }

    /* ----------------------- ADD INPUT ----------------------- */
    this.psbt.addInput(
      trimUndefined({
        hash: txInput.hash,
        index: txInput.index,
        sequence: txInput.sequence,

        // For SegWit / Taproot
        witnessUtxo: sellerInput.witnessUtxo,
        tapInternalKey: sellerInput.tapInternalKey,
        witnessScript: sellerInput.witnessScript,

        // For legacy P2PKH (or P2SH)
        nonWitnessUtxo: sellerInput.nonWitnessUtxo,

        // For P2SH or P2SH-P2WPKH
        redeemScript: sellerInput.redeemScript,

        // The already-finalized data
        finalScriptSig: sellerInput.finalScriptSig,
        finalScriptWitness: sellerInput.finalScriptWitness,
      })
    );

    this.psbt.addOutput({
      script: sellerOutpt.script,
      value: sellerOutpt.value,
    });

    this.cumulativeValueInPsbts += sellerOutpt.value;
  }

  private appendPsbtsToTx(): void {
    if (this.transactionOptions.includePsbts!.length === 0) return;

    for (const sellerBase64 of this.transactionOptions.includePsbts!) {
      try {
        this.appendSinglePsbtToTx(sellerBase64);
      } catch (error) {
        console.error(
          chalk.red("Failed to append PSBT to transaction:"),
          error
        );
        throw new Error("Failed to append PSBT to transaction");
      }
    }
  }

  public async build(): Promise<[number, Buffer | undefined]> {
    await this.initialize();

    this.appendPsbtsToTx();

    this.addInputs();
    const btcOutputs = this.getBtcOutputs();

    const hasChange = this.addOutputs(btcOutputs);

    const edicts = this.createEdicts(btcOutputs, hasChange);
    let protostone = this.addProtostoneData(edicts);

    //If we have a alkanestone, we need to add a second output for the opreturn. Otherwise just one for the change
    return [this.utxos.length + (protostone ? 2 : 1), protostone];
  }

  public async finalizeWithDry(): Promise<Transaction> {
    return extractWithDummySigs(this.psbt);
  }

  public extractPsbtBase64(): string {
    return this.psbt.toBase64();
  }

  public getPsbt(): Psbt {
    return this.psbt;
  }
}

export type SingularBTCTransfer = {
  asset: "btc";
  amount: number;
  address: string;
  ignorePush?: boolean; //If true, the transfer will not be pushed to the alkanestone
};

export type SingularAlkanesTransfer = {
  asset: AlkaneId; // Alkanes protocol ID (eg: 2:1231231)
  amount: bigint;
  address: string;
};

export type SingularTransfer = SingularBTCTransfer | SingularAlkanesTransfer;

export type ProtostoneTransactionOptions =
  (typeof ProtostoneTransaction)["prototype"]["transactionOptions"];

type IProtostoneTransactionDryRunResponse = {
  dummyTx: Transaction;
  dummyInputLength: number;
  useMaraPool: boolean;
  feeOpts: IFeeOpts;
};

export async function getDummyProtostoneTransaction(
  addressProvided: string,
  options: ProtostoneTransactionOptions
): Promise<BoxedResponse<IProtostoneTransactionDryRunResponse, string>> {
  try {
    const dummyAlkanessTx = new ProtostoneTransaction(addressProvided, options);
    const [dummyInputLength, dummyProtostone] = await dummyAlkanessTx.build();
    let useMaraPool = false;

    if (dummyProtostone) {
      if (dummyProtostone.byteLength > 80) {
        useMaraPool = true;
        console.log(
          chalk.yellow(
            `\nWARNING: Protostone exceeds 80 bytes.\n` +
              `Only MARA pool currently supports OP_RETURNs over 80 bytes.\n` +
              `This transaction may take hours or even a day to confirm.\n` +
              `Proposal to increase the limit: https://github.com/bitcoin/bitcoin/pull/32359\n`
          )
        );
      }
    }
    const dummyTx = await dummyAlkanessTx.finalizeWithDry();

    const feeOpts = {
      vsize: dummyTx.virtualSize(),
      input_length: dummyInputLength,
    };

    return new BoxedSuccess({
      dummyTx,
      dummyInputLength,
      useMaraPool,
      feeOpts,
    });
  } catch (e) {
    console.log("Error creating dummy transaction", e);
    return new BoxedError(
      "TransactionError",
      "Failed to create dummy transaction: " +
        (e instanceof Error ? e.message : "Unknown error")
    );
  }
}

//[transaction, useMaraPool] = getProtostoneTransaction(address, options)
export async function getProtostoneUnsignedPsbtBase64(
  addressProvided: string,
  options: Omit<ProtostoneTransactionOptions, "psbtTransfers">
): Promise<
  BoxedResponse<
    {
      fee: number;
      psbtBase64: string;
      vsize: number;
      useMaraPool: boolean;
    },
    string
  >
> {
  const response = await getDummyProtostoneTransaction(
    addressProvided,
    options
  );
  if (isBoxedError(response)) {
    return response;
  }

  const { dummyTx, dummyInputLength, useMaraPool } = response.data;

  const vsize = dummyTx.virtualSize();

  const alkanestoneTx = new ProtostoneTransaction(addressProvided, {
    ...options,
    feeOpts: {
      vsize,
      input_length: dummyInputLength,
    },
  });
  await alkanestoneTx.build();
  const psbtBase64 = await alkanestoneTx.extractPsbtBase64();

  return new BoxedSuccess({
    psbtBase64,
    useMaraPool,
    vsize,
    fee: alkanestoneTx.fee,
  });
}
