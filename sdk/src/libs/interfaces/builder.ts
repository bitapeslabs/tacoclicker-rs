/*─────────────────────────────────────────────────────────────
   ABI TOOLKIT – v3 (custom, zero‑arg, cleaner)
   -----------------------------------------------------------
   Highlights
   • new `custom()` helper -> one entry‑point for bespoke logic
   • zero‑argument `view()` / `execute()` now supported
   • optional‑arg signatures are inferred automatically
   • kept compile‑time duplicate‑opcode guard & full type‑safety
──────────────────────────────────────────────────────────────*/

/*------------------------------------------------------------*
 | 0. Imports & shared types                                   |
 *------------------------------------------------------------*/
import { BorshSchema, Infer as BorshInfer } from "borsher";
import {
  AlkanesBaseContract,
  AlkanesPushExecuteResponse,
  AlkanesSimulationError,
  OpcodeTable,
} from "./base";
import { IDecodableAlkanesResponse } from "../decoders";
import { AvailableDecodeKind as DecKind } from "../decoders";
import { ProtostoneTransactionOptions } from "../alkanes";
import {
  AvailableEncodeKind,
  AvailableEncodeKind as EncKind,
} from "../encoders";
import { AlkanesExecuteError } from "../alkanes";
import { BoxedResponse } from "@/boxed";

/*------------------------------------------------------------*
 | 1.  Extra helper – a sentinel for “no input”                |
 *------------------------------------------------------------*/
const VOID_ENC = "__void" as const;
type VoidEnc = typeof VOID_ENC;

export type ProtostoneTransactionOptionsPartial =
  Partial<ProtostoneTransactionOptions>;

/** Encode‑kind augmented with a sentinel for “no args”. */
export type Enc = EncKind | VoidEnc;
export type Dec =
  | Exclude<DecKind, "object">
  | BorshSchema<any>
  | ArraySchema<any>
  | ObjectSchema<any>;

/*------------------------------------------------------------*
 | 2.  Schema mapper                                           |
 *------------------------------------------------------------*/
interface ArraySchema<E extends Schema> {
  kind: "array";
  element: E;
}
interface ObjectSchema<F extends Record<string, Schema>> {
  kind: "object";
  fields: F;
}
export type Schema =
  | Enc
  | BorshSchema<any>
  | ArraySchema<any>
  | ObjectSchema<any>;

export type ResolveSchema<S> =
  /* sentinel -> omit */
  S extends VoidEnc
    ? never
    : /* primitives … */
      S extends "string"
      ? string
      : S extends "number"
        ? number
        : S extends "bigint"
          ? bigint
          : S extends "boolean"
            ? boolean
            : /* Borsh — generic or non‑generic */
              S extends BorshSchema<infer _Any>
              ? BorshInfer<S>
              : S extends BorshSchema<any>
                ? BorshInfer<S>
                : /* compound */
                  S extends ArraySchema<infer E>
                  ? ResolveSchema<E>[]
                  : S extends ObjectSchema<infer F>
                    ? { [K in keyof F]: ResolveSchema<F[K]> }
                    : never;
/*------------------------------------------------------------*
 | 3.  Spec record shapes                                      |
 *------------------------------------------------------------*/
const VIEW_TAG = Symbol("view");
const EXEC_TAG = Symbol("execute");
const CUSTOM_TAG = Symbol("custom");

export interface ViewSpec<I extends Schema = Schema, O extends Dec = Dec> {
  _t: typeof VIEW_TAG;
  opcode: bigint;
  input: I;
  output: O;
  impl?: (this: AlkanesBaseContract, arg: ResolveSchema<I>) => any;
}

/** inscription (K) is either a BorshSchema or the sentinel */
export interface ExecuteSpec<
  I extends Schema = Schema,
  K extends BorshSchema<any> | VoidEnc = VoidEnc,
  O extends Dec = Dec,
> {
  _t: typeof EXEC_TAG;
  opcode: bigint;
  input: I;
  output: O;
  inscription: K;
  impl?: (
    this: AlkanesBaseContract,
    address: string,
    arg: ResolveSchema<I>,
    argInscription: ResolveSchema<K>,
    txOpts?: ProtostoneTransactionOptionsPartial, // ← NEW
  ) => any;
}
type CustomImpl<P> = (
  this: AlkanesBaseContract,
  opcode: bigint,
  params: P,
) => any;

export interface CustomSpec<I, O, Impl extends CustomImpl<I>> {
  _t: typeof CUSTOM_TAG;
  opcode: bigint;
  input: I;
  output: O;
  impl: Impl;
}

type AnySpec =
  | ViewSpec<any, any>
  | ExecuteSpec<any, any, any>
  | CustomSpec<any, any, any>;

/*------------------------------------------------------------*
 | 4.  Builder helpers                                         |
 *------------------------------------------------------------*/
const createViewBuilder = <I extends Schema>(opcode: bigint, input: I) => {
  /* allow .returns() or .returns(schema) */
  const returns = <O extends Dec = "uint8Array">(
    output?: O,
  ): ViewSpec<I, O> => ({
    _t: VIEW_TAG,
    opcode,
    input,
    // if omitted, default to "uint8Array"
    output: (output ?? "uint8Array") as O,
  });

  return { returns } as const;
};

/* ---------- EXECUTE ---------- */
const createExecuteBuilder = <
  I extends Schema = VoidEnc,
  K extends BorshSchema<any> | VoidEnc = VoidEnc,
>(
  opcode: bigint,
  input: I,
  inscription?: K,
) => {
  const returns = <O extends Dec = "uint8Array">(
    output?: O,
  ): ExecuteSpec<I, K, O> => ({
    _t: EXEC_TAG,
    opcode,
    input,
    output: (output ?? "uint8Array") as O,
    inscription: (inscription ?? VOID_ENC) as K,
  });

  return { returns } as const;
};

/*─────────────────────────────────────────────────────────────*
 | 5.  Custom (single entry‑point)                             |
 *─────────────────────────────────────────────────────────────*/
type ExtractParam<T> = T extends (
  this: any,
  opcode: bigint,
  params: infer P,
) => any
  ? P
  : never;

function defineCustom<
  Impl extends CustomImpl<any>,
  P = ExtractParam<Impl>,
  O extends Dec = "uint8Array",
>(opcode: bigint, impl: Impl, opts?: { output?: O }): CustomSpec<P, O, Impl> {
  const output = (opts?.output ?? "uint8Array") as O;
  return {
    _t: CUSTOM_TAG,
    opcode,
    input: undefined as unknown as P,
    output,
    impl,
  };
}

/*------------------------------------------------------------*
 | 6.  Runtime wiring                                          |
 *------------------------------------------------------------*/
function wireMethods(
  target: AlkanesBaseContract,
  spec: Record<string, AnySpec>,
) {
  for (const [name, meta] of Object.entries(spec)) {
    /* ---------- VIEW ---------- */
    if (meta._t === VIEW_TAG) {
      (target as any)[name] = meta.impl
        ? meta.impl.bind(target)
        : (arg?: any) =>
            target.handleView(meta.opcode, arg, meta.input, meta.output);
      continue;
    }

    /* ---------- EXECUTE (address + 0 / 1 / 2 extra args) ---------- */
    if (meta._t === EXEC_TAG) {
      const hasInput = meta.input !== VOID_ENC;
      const hasInscr = meta.inscription !== VOID_ENC;
      const mandatory = (hasInput ? 1 : 0) + (hasInscr ? 1 : 0);

      (target as any)[name] = (...callArgs: any[]) => {
        const [addr, ...rest] = callArgs;

        // split mandatory vs optional parts
        const mandatoryArgs = rest.slice(0, mandatory);
        const maybeTxOpts = rest.slice(mandatory)[0] as
          | ProtostoneTransactionOptionsPartial
          | undefined;

        // assign by position
        let arg: any = undefined;
        let inscr: any = undefined;

        if (hasInput && hasInscr) {
          [arg, inscr] = mandatoryArgs;
        } else if (hasInput) {
          [arg] = mandatoryArgs;
        } else if (hasInscr) {
          [inscr] = mandatoryArgs;
        }

        return meta.impl
          ? meta.impl.call(target, addr, arg, inscr, maybeTxOpts)
          : target.handleExecute(
              addr,
              meta.opcode,
              arg,
              inscr,
              meta.input,
              meta.inscription,
              meta.output,
              maybeTxOpts,
            );
      };
      continue;
    }

    /* ---------- CUSTOM ---------- */
    if (meta._t === CUSTOM_TAG) {
      (target as any)[name] = (params?: any) =>
        (meta as CustomSpec<any, any, any>).impl!.call(
          target,
          (meta as CustomSpec<any, any, any>).opcode,
          params!,
        );
      continue;
    }
  }
}

/*------------------------------------------------------------*
 | 7.  Duplicate‑opcode guard & table                          |
 *------------------------------------------------------------*/
function buildOpcodeTable(spec: Record<string, AnySpec>): OpcodeTable {
  const table: Record<string, bigint> = {};
  for (const [k, v] of Object.entries(spec)) {
    table[k] = v.opcode;
  }
  return table as OpcodeTable;
}

/*------------------------------------------------------------*
 | 8. attach() – mixes ABI into a concrete subclass            |
 *------------------------------------------------------------*/
function attach<
  Spec extends Record<string, any>,
  Base extends typeof AlkanesBaseContract,
>(BaseClass: Base, spec: Spec) {
  /* helper – tail args depending on schemas */
  type Tail<E extends ExecuteSpec> = E["input"] extends VoidEnc
    ? E["inscription"] extends VoidEnc
      ? [] // none
      : [ResolveSchema<E["inscription"]>] // inscription only
    : E["inscription"] extends VoidEnc
      ? [ResolveSchema<E["input"]>] // input only
      : [ResolveSchema<E["input"]>, ResolveSchema<E["inscription"]>]; // both

  type ExecuteSignature<E extends ExecuteSpec> = (
    address: string,
    ...args: [...Tail<E>, ProtostoneTransactionOptionsPartial?] // ← NEW optional tail
  ) => Promise<
    BoxedResponse<
      AlkanesPushExecuteResponse<ResolveSchema<E["output"]>>,
      AlkanesExecuteError
    >
  >;

  type ViewSignature<V extends ViewSpec> = (
    arg: V["input"] extends VoidEnc ? void : ResolveSchema<V["input"]>,
  ) => Promise<
    BoxedResponse<ResolveSchema<V["output"]>, AlkanesSimulationError>
  >;

  type CustomSignature<C extends CustomSpec<any, any, any>> =
    C["input"] extends never
      ? () => ReturnType<NonNullable<C["impl"]>>
      : (params: C["input"]) => ReturnType<NonNullable<C["impl"]>>;

  type MethodMap = {
    [K in keyof Spec]: Spec[K] extends { _t: typeof VIEW_TAG }
      ? ViewSignature<Spec[K]>
      : Spec[K] extends { _t: typeof EXEC_TAG }
        ? ExecuteSignature<Spec[K]>
        : Spec[K] extends { _t: typeof CUSTOM_TAG }
          ? CustomSignature<Spec[K]>
          : never;
  };

  //@ts-expect-error
  class Derived extends BaseClass {
    private readonly opcodeTable: OpcodeTable = buildOpcodeTable(spec);

    public get OpCodes(): OpcodeTable {
      return this.opcodeTable;
    }

    constructor(...args: any[]) {
      //@ts-expect-error
      super(...args);
      wireMethods(this, spec);
    }
  }

  type ConcreteBase = Omit<InstanceType<Base>, keyof MethodMap | "OpCodes"> & {
    OpCodes: OpcodeTable;
  };

  return Derived as unknown as {
    new (...a: ConstructorParameters<Base>): ConcreteBase & MethodMap;
  };
}

/*------------------------------------------------------------*
 | 9. contract() builder with chainable extend()               |
 *------------------------------------------------------------*/
function contract<Base extends Record<string, any>>(base: Base) {
  function extend<Extra extends Record<string, any>>(extra: Extra) {
    return contract({ ...base, ...extra } as Base & Extra);
  }
  return Object.assign(Object.create(null), base, { extend }) as Base & {
    extend: typeof extend;
  };
}

/*------------------------------------------------------------*
 | 10. Public façade                                           |
 *------------------------------------------------------------*/
export const abi = {
  opcode: (code: bigint) => {
    /* ---------- view ---------- */
    const viewFn = (<I extends Schema>(input?: I) =>
      createViewBuilder(code, (input ?? VOID_ENC) as I)) as {
      <I extends Schema>(input: I): ReturnType<typeof createViewBuilder<I>>;
      (): ReturnType<typeof createViewBuilder<VoidEnc>>;
    };

    /* ---------- execute ---------- */
    const execFn = (<I extends Schema, K extends BorshSchema<any>>(
      input?: I,
      inscription?: K,
    ) =>
      createExecuteBuilder(
        code,
        (input ?? VOID_ENC) as I,
        (inscription ?? VOID_ENC) as K | VoidEnc,
      )) as {
      // both
      <I extends Schema, K extends BorshSchema<any>>(
        input: I,
        inscription: K,
      ): ReturnType<typeof createExecuteBuilder<I, K>>;
      // only inscription
      <K extends BorshSchema<any>>(
        input: undefined,
        inscription: K,
      ): ReturnType<typeof createExecuteBuilder<VoidEnc, K>>;
      // only input
      <I extends Schema>(
        input: I,
      ): ReturnType<typeof createExecuteBuilder<I, VoidEnc>>;
      // none
      (): ReturnType<typeof createExecuteBuilder<VoidEnc, VoidEnc>>;
    };

    return {
      view: viewFn,
      execute: execFn,
      custom: <Impl extends CustomImpl<any>, O extends Dec = "uint8Array">(
        impl: Impl,
        opts?: { output?: O },
      ) => defineCustom<Impl, ExtractParam<Impl>, O>(code, impl, opts),
    } as const;
  },

  contract,

  attach,

  extend: <
    A extends Record<string, AnySpec>,
    B extends Record<string, AnySpec>,
  >(
    a: A,
    b: B,
  ) => ({ ...a, ...b }) as A & B,
} as const;
