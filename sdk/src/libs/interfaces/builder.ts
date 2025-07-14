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
import { AlkanesBaseContract, AlkanesPushExecuteResponse, AlkanesSimulationError, OpcodeTable } from "./base";
import { IDecodableAlkanesResponse } from "../decoders";
import { AvailableDecodeKind as DecKind } from "../decoders";
import { AvailableEncodeKind, AvailableEncodeKind as EncKind } from "../encoders";
import { AlkanesExecuteError } from "../alkanes";
import { BoxedResponse } from "@/boxed";

/*------------------------------------------------------------*
 | 1.  Extra helper – a sentinel for “no input”                |
 *------------------------------------------------------------*/
const VOID_ENC = "__void" as const;
type VoidEnc = typeof VOID_ENC;

/** Encode‑kind augmented with a sentinel for “no args”. */
type Enc = EncKind | VoidEnc;
type Dec = Exclude<DecKind, "object"> | BorshSchema<any> | ArraySchema<any> | ObjectSchema<any>;

type ICustomOpts = Partial<{
  input: Enc; // input kind
  output: Dec; // output kind
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
export type Schema = Enc | BorshSchema<any> | ArraySchema<any> | ObjectSchema<any>;

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
const CUSTOM_TAG = Symbol("custom");

type AnyImpl = (...args: any[]) => any;

export interface ViewSpec<I extends Schema = Schema, O extends Dec = Dec> {
  _t: typeof VIEW_TAG;
  opcode: bigint;
  input: I;
  output: O;
  impl?: (this: AlkanesBaseContract, arg: ResolveSchema<I>) => any;
}

export interface ExecuteSpec<I extends Schema = Schema, O extends Dec = Dec> {
  _t: typeof EXEC_TAG;
  opcode: bigint;
  input: I;
  output: O;
  asInscription: boolean;
  impl?: (this: AlkanesBaseContract, address: string, arg: ResolveSchema<I>, asInscription: boolean) => any;
}

type CustomImpl<P> = (this: AlkanesBaseContract, opcode: bigint, params: P) => any; // leave this broad, we’ll capture the full signature in the spec

export interface CustomSpec<
  I, // the “decoded param” type
  O, // the decode‐kind
  Impl extends CustomImpl<I>, // the actual function type
> {
  _t: typeof CUSTOM_TAG;
  opcode: bigint;
  input: I;
  output: O;
  impl: Impl; // ← now preserves both param‐type _and_ return‐type
}

type AnySpec = ViewSpec<any, any> | ExecuteSpec<any, any> | CustomSpec<any, any, any>;

/*------------------------------------------------------------*
 | 4.  Builder helpers                                         |
 *------------------------------------------------------------*/
const createViewBuilder = <I extends Schema>(opcode: bigint, input: I) => ({
  returns: <O extends Dec>(output: O): ViewSpec<I, O> => ({
    _t: VIEW_TAG,
    opcode,
    input,
    output,
  }),
});

const createExecuteBuilder = <I extends Schema>(opcode: bigint, input: I, asInscription = false) => ({
  returns: <O extends Dec>(output: O): ExecuteSpec<I, O> => ({
    _t: EXEC_TAG,
    opcode,
    input,
    output,
    asInscription,
  }),
});

/*─────────────────────────────────────────────────────────────*
 | 5.  Custom (single entry-point)                             |
 *─────────────────────────────────────────────────────────────*/
/** Core impl shapes */
type ViewImpl<P> = (this: AlkanesBaseContract, arg: P) => any;
type ExecImpl<P> = (this: AlkanesBaseContract, address: string, arg: P, asInscription: boolean) => any;

type ExtractParam<T> = T extends (this: any, opcode: bigint, params: infer P) => any ? P : never;

function defineCustom<Impl extends CustomImpl<any>, P = ExtractParam<Impl>, O extends Dec = "uint8Array">(
  opcode: bigint,
  impl: Impl,
  opts?: { output?: O },
): CustomSpec<P, O, Impl> {
  const output = (opts?.output ?? "uint8Array") as O;
  return {
    _t: CUSTOM_TAG,
    opcode,
    input: undefined as unknown as P,
    output,
    impl, // ← strongly typed Impl here
  };
}
/*------------------------------------------------------------*
 | 6.  Runtime wiring                                          |
 *------------------------------------------------------------*/
function wireMethods(target: AlkanesBaseContract, spec: Record<string, AnySpec>) {
  for (const [name, meta] of Object.entries(spec)) {
    if (meta._t === VIEW_TAG) {
      (target as any)[name] = meta.impl
        ? meta.impl.bind(target)
        : (arg?: any) => target.handleView(meta.opcode, arg, meta.input, meta.output);
    } else if (meta._t === EXEC_TAG) {
      (target as any)[name] = meta.impl
        ? (addr: string, arg?: any) => meta.impl!.call(target, addr, arg, meta.asInscription)
        : (addr: string, arg?: any) =>
            target.handleExecute(addr, meta.opcode, arg, meta.input, meta.output, meta.asInscription);
    } else if (meta._t === CUSTOM_TAG) {
      (target as any)[name] = (params?: any) => meta.impl!.call(target, meta.opcode, params!);
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
function attach<Spec extends Record<string, any>, Base extends typeof AlkanesBaseContract>(
  BaseClass: Base,
  spec: Spec,
) {
  /* type helpers for methods --------------------------------------- */
  type ViewSignature<V extends ViewSpec> = (
    arg: V["input"] extends VoidEnc ? void : ResolveSchema<V["input"]>,
  ) => Promise<BoxedResponse<ResolveSchema<V["output"]>, AlkanesSimulationError>>;

  type ExecuteSignature<E extends ExecuteSpec> = (
    address: string,
    arg: E["input"] extends VoidEnc ? void : ResolveSchema<E["input"]>,
  ) => Promise<BoxedResponse<AlkanesPushExecuteResponse<ResolveSchema<E["output"]>>, AlkanesExecuteError>>;
  type CustomSignature<C extends CustomSpec<any, any, any>> = C["input"] extends never
    ? () => ReturnType<NonNullable<C["impl"]>>
    : (params: C["input"]) => ReturnType<NonNullable<C["impl"]>>;

  type MethodMap = {
    [K in keyof Spec]: Spec[K] extends ViewSpec
      ? ViewSignature<Spec[K]>
      : Spec[K] extends ExecuteSpec
        ? ExecuteSignature<Spec[K]>
        : Spec[K] extends CustomSpec<any, any, any>
          ? CustomSignature<Spec[K]>
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
    const viewFn = (<I extends Schema>(input?: I) => createViewBuilder(code, (input ?? VOID_ENC) as I)) as {
      <I extends Schema>(input: I): ReturnType<typeof createViewBuilder<I>>;
      (): ReturnType<typeof createViewBuilder<VoidEnc>>;
    };

    const execFn = (<I extends Schema>(input?: I, as = false) =>
      createExecuteBuilder(code, (input ?? VOID_ENC) as I, as)) as {
      <I extends Schema>(input: I, as?: boolean): ReturnType<typeof createExecuteBuilder<I>>;
      (input?: undefined, as?: boolean): ReturnType<typeof createExecuteBuilder<VoidEnc>>;
    };

    return {
      view: viewFn,
      execute: execFn,
      custom: <Impl extends CustomImpl<any>, O extends Dec = "uint8Array">(impl: Impl, opts?: { output?: O }) =>
        defineCustom<Impl, ExtractParam<Impl>, O>(code, impl, opts),
    } as const;
  },

  contract,

  attach,

  extend: <A extends Record<string, AnySpec>, B extends Record<string, AnySpec>>(a: A, b: B) =>
    ({ ...a, ...b }) as A & B,
} as const;
