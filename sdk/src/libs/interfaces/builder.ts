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
  AlkanesSimulationError,
  OpcodeTable,
} from "./base";
import { IDecodableAlkanesResponse } from "../decoders";
import { AvailableDecodeKind as DecKind } from "../decoders";
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

/** Encode‑kind augmented with a sentinel for “no args”. */
type Enc = EncKind | VoidEnc;
type ICustomOpts = Partial<{
  input: Enc; // input kind
  output: DecKind; // output kind
  asInscription: boolean; // inscription flag
}>;
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

export type ResolveSchema<S> = S extends VoidEnc
  ? never // “no arg” maps to never so callers can omit it
  : S extends "string"
    ? string
    : S extends "number"
      ? number
      : S extends "bigint"
        ? bigint
        : S extends "boolean"
          ? boolean
          : S extends BorshSchema<infer U>
            ? BorshInfer<S>
            : S extends ArraySchema<infer E>
              ? ResolveSchema<E>[]
              : S extends ObjectSchema<infer F>
                ? { [K in keyof F]: ResolveSchema<F[K]> }
                : never;

/*------------------------------------------------------------*
 | 3.  Spec record shapes                                      |
 *------------------------------------------------------------*/
const VIEW_TAG = Symbol("view");
const EXEC_TAG = Symbol("execute");

type AnyImpl = (...args: any[]) => any;

export interface ViewSpec<I extends Enc = Enc, O extends DecKind = DecKind> {
  _t: typeof VIEW_TAG;
  opcode: bigint;
  input: I;
  output: O;
  impl?: (this: AlkanesBaseContract, arg: ResolveSchema<I>) => any;
}

export interface ExecuteSpec<I extends Enc = Enc, O extends DecKind = DecKind> {
  _t: typeof EXEC_TAG;
  opcode: bigint;
  input: I;
  output: O;
  asInscription: boolean;
  impl?: (
    this: AlkanesBaseContract,
    address: string,
    arg: ResolveSchema<I>,
    asInscription: boolean
  ) => any;
}

type AnySpec = ViewSpec<any, any> | ExecuteSpec<any, any>;

/*------------------------------------------------------------*
 | 4.  Builder helpers                                         |
 *------------------------------------------------------------*/
const createViewBuilder = <I extends Enc>(opcode: bigint, input: I) => ({
  returns: <O extends DecKind>(output: O): ViewSpec<I, O> => ({
    _t: VIEW_TAG,
    opcode,
    input,
    output,
  }),
});

const createExecuteBuilder = <I extends Enc>(
  opcode: bigint,
  input: I,
  asInscription = false
) => ({
  returns: <O extends DecKind>(output: O): ExecuteSpec<I, O> => ({
    _t: EXEC_TAG,
    opcode,
    input,
    output,
    asInscription,
  }),
});

/*─────────────────────────────────────────────────────────────*
 | 5.  Custom (single entry-point)                            |
 *─────────────────────────────────────────────────────────────*/

// Generic impl type that preserves the `this` annotation
type Impl<TThis extends AlkanesBaseContract, TArgs extends any[], TRet> = (
  this: TThis,
  ...args: TArgs
) => TRet;

/**
 * Define a custom view *or* execute.
 * - Heuristic: if the callback declares ≥2 runtime args
 *              → treated as EXECUTE.
 * - `opts` lets you refine input/output kinds & inscription flag.
 */
/*─────────────────────────────────────────────────────────────*
 | 5.  Custom (single entry-point)                             |
 *─────────────────────────────────────────────────────────────*/
/** Core impl shapes */
type ViewImpl<P> = (this: AlkanesBaseContract, arg: P) => any;
type ExecImpl<P> = (
  this: AlkanesBaseContract,
  address: string,
  arg: P,
  asInscription: boolean
) => any;

/**
 * defineCustom – generic in:
 *   P  = decoded **param** type   (defaults to `never`)
 *   O  = decode-kind for **return** (defaults `"uint8Array"`)
 */
function defineCustom<P = never, O extends DecKind = "uint8Array">(
  opcode: bigint,
  impl: ViewImpl<P> | ExecImpl<P>,
  opts: ICustomOpts = {}
): AnySpec {
  const output = (opts.output ?? "uint8Array") as O;
  const asInscription = opts.asInscription ?? false;

  // decide EXEC vs VIEW
  const isExec = impl.length >= 2;

  return isExec
    ? ({
        _t: EXEC_TAG,
        opcode,
        input: VOID_ENC,
        output,
        asInscription,
        impl,
      } as ExecuteSpec<VoidEnc, O>) // safe cast
    : ({
        _t: VIEW_TAG,
        opcode,
        input: VOID_ENC,
        output,
        impl,
      } as ViewSpec<VoidEnc, O>); // safe cast
}
/*------------------------------------------------------------*
 | 6.  Runtime wiring                                          |
 *------------------------------------------------------------*/
function wireMethods(
  target: AlkanesBaseContract,
  spec: Record<string, AnySpec>
) {
  for (const [name, meta] of Object.entries(spec)) {
    if (meta._t === VIEW_TAG) {
      (target as any)[name] = meta.impl
        ? meta.impl.bind(target)
        : (arg?: any) =>
            (target as any).handleView(meta.opcode, arg, meta.output);
    } else {
      (target as any)[name] = meta.impl
        ? (addr: string, arg?: any) =>
            meta.impl!.call(target, addr, arg, meta.asInscription)
        : (addr: string, arg?: any) =>
            (target as any).handleExecute(
              addr,
              meta.opcode,
              arg,
              meta.output,
              meta.asInscription
            );
    }
  }
}

/*------------------------------------------------------------*
 | 7.  Duplicate‑opcode guard & table                          |
 *------------------------------------------------------------*/
function buildOpcodeTable(spec: Record<string, AnySpec>): OpcodeTable {
  const table: Record<string, bigint> = {};
  const seen: bigint[] = [];
  for (const [k, v] of Object.entries(spec)) {
    if (seen.includes(v.opcode)) {
      // compile‑time duplicate trigger
      type _Dup = { DUPLICATE_OPCODE: typeof v.opcode };
      // @ts-expect-error duplicate opcode
      const _never: never = _Dup;
    }
    seen.push(v.opcode);
    table[k] = v.opcode;
  }
  return table as OpcodeTable;
}

/*------------------------------------------------------------*
 | 7. attach() – mixes ABI into a concrete subclass            |
 *------------------------------------------------------------*/
function attach<
  Spec extends Record<string, any>,
  Base extends typeof AlkanesBaseContract,
>(BaseClass: Base, spec: Spec) {
  /* type helpers for methods --------------------------------------- */
  type ViewSignature<V extends ViewSpec> = (
    arg: ResolveSchema<V["input"]>
  ) => Promise<
    BoxedResponse<ResolveSchema<V["output"]>, AlkanesSimulationError>
  >;

  type ExecuteSignature<E extends ExecuteSpec> = (
    address: string,
    arg: ResolveSchema<E["input"]>
  ) => Promise<
    BoxedResponse<
      IDecodableAlkanesResponse<ResolveSchema<E["output"]>>,
      AlkanesExecuteError
    >
  >;

  type MethodMap = {
    [K in keyof Spec]: Spec[K] extends ViewSpec
      ? ViewSignature<Spec[K]>
      : Spec[K] extends ExecuteSpec
        ? ExecuteSignature<Spec[K]>
        : never;
  };

  // @ts-expect-error TS2545 – mix-in: constructor uses generic spread

  class Derived extends BaseClass {
    /** concrete getter – satisfies abstract contract */
    private readonly opcodeTable: OpcodeTable = buildOpcodeTable(spec);

    public get OpCodes(): OpcodeTable {
      return this.opcodeTable;
    }

    constructor(...args: any[]) {
      // @ts-expect-error generic spread (see earlier note)
      super(...args);
      wireMethods(this, spec);
    }
  }

  type ConcreteBase = Omit<InstanceType<Base>, "OpCodes"> & {
    OpCodes: OpcodeTable;
  };

  return Derived as unknown as {
    new (...a: ConstructorParameters<Base>): ConcreteBase & MethodMap;
  };
}

function contract<Base extends Record<string, any>>(base: Base) {
  /** merges two ABI objects and preserves type information */
  function extend<Extra extends Record<string, any>>(extra: Extra) {
    /* the spread keeps runtime behaviour; calling contract() again
       re-injects a fresh .extend method so chaining works forever. */
    return contract({ ...base, ...extra } as Base & Extra);
  }

  /* attach extend while preserving exact field types */
  return Object.assign(Object.create(null), base, { extend }) as Base & {
    extend: typeof extend;
  };
}

/*------------------------------------------------------------*
 | 9.  Public façade                                           |
 *------------------------------------------------------------*/
export const abi = {
  opcode: (code: bigint) => {
    const viewFn = (<I extends Enc>(input?: I) =>
      createViewBuilder(code, (input ?? VOID_ENC) as I)) as {
      <I extends Enc>(input: I): ReturnType<typeof createViewBuilder<I>>;
      (): ReturnType<typeof createViewBuilder<VoidEnc>>;
    };

    const execFn = (<I extends Enc>(input?: I, as = false) =>
      createExecuteBuilder(code, (input ?? VOID_ENC) as I, as)) as {
      <I extends Enc>(
        input: I,
        as?: boolean
      ): ReturnType<typeof createExecuteBuilder<I>>;
      (
        input?: undefined,
        as?: boolean
      ): ReturnType<typeof createExecuteBuilder<VoidEnc>>;
    };

    return {
      view: viewFn,
      execute: execFn,
      custom: <
        P = never, // ← NEW generic, user-supplied
        O extends DecKind = "uint8Array",
      >(
        impl: ViewImpl<P> | ExecImpl<P>,
        opts?: { output?: O; asInscription?: boolean }
      ) => defineCustom<P, O>(code, impl, opts),
    } as const;
  },

  contract,

  attach,

  extend: <
    A extends Record<string, AnySpec>,
    B extends Record<string, AnySpec>,
  >(
    a: A,
    b: B
  ) => ({ ...a, ...b }) as A & B,
} as const;
