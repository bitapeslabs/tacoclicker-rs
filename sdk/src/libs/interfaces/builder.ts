/*─────────────────────────────────────────────────────────────
   ABI TOOLKIT – strongly-typed builder + runtime wiring
──────────────────────────────────────────────────────────────*/

import { BorshSchema, Infer as BorshInfer } from "borsher";
import {
  AlkanesBaseContract,
  AlkanesSimulationError,
  OpcodeTable,
} from "./base";
import { IDecodableAlkanesResponse } from "../decoders";
import { AlkanesExecuteError } from "../alkanes";
import { BoxedResponse } from "@/boxed";

/*------------------------------------------------------------*
 | 1. Compile-time “schema language”                           |
 *------------------------------------------------------------*/
type Primitive = "string" | "number" | "bigint" | "boolean";

interface ArraySchema<Element extends Schema> {
  kind: "array";
  element: Element;
}
interface ObjectSchema<Fields extends Record<string, Schema>> {
  kind: "object";
  fields: Fields;
}

export type Schema =
  | Primitive
  | BorshSchema<any>
  | ArraySchema<any>
  | ObjectSchema<any>;

/** Map a Schema into the corresponding TypeScript type */
export type ResolveSchema<S> = S extends "string"
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
 | 2. Spec objects – runtime metadata                          |
 *------------------------------------------------------------*/
const VIEW_TAG = Symbol("view");
const EXEC_TAG = Symbol("execute");

/** Common shape for views */
export interface ViewSpec<
  Input extends Schema = any,
  Output extends Schema = any,
> {
  _t: typeof VIEW_TAG;
  opcode: bigint;
  input: Input;
  output: Output;
  impl?: (
    this: AlkanesBaseContract,
    arg: ResolveSchema<Input>
  ) => ResolveSchema<Output>;
}

/** Common shape for executes */
export interface ExecuteSpec<
  Input extends Schema = any,
  Output extends Schema = any,
> {
  _t: typeof EXEC_TAG;
  opcode: bigint;
  input: Input;
  output: Output;
  asInscription: boolean;
  impl?: (
    this: AlkanesBaseContract,
    address: string,
    arg: ResolveSchema<Input>,
    asInscription: boolean
  ) => ResolveSchema<Output>;
}

/*------------------------------------------------------------*
 | 3.  Fluent builders for view / execute                      |
 *------------------------------------------------------------*/
function createViewBuilder<Input extends Schema>(opcode: bigint, input: Input) {
  return {
    returns: <Output extends Schema>(
      output: Output
    ): ViewSpec<Input, Output> => ({
      _t: VIEW_TAG,
      opcode,
      input,
      output,
    }),
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

function createExecuteBuilder<Input extends Schema>(
  opcode: bigint,
  input: Input,
  asInscription = false
) {
  return {
    returns: <Output extends Schema>(
      output: Output
    ): ExecuteSpec<Input, Output> => ({
      _t: EXEC_TAG,
      opcode,
      input,
      output,
      asInscription,
    }),
  };
}

/*------------------------------------------------------------*
 | 4.  Helpers for custom implementations                      |
 *------------------------------------------------------------*/
const defineCustomView = <Input extends Schema, Output extends Schema>(
  opcode: bigint,
  input: Input,
  output: Output,
  impl: (
    this: AlkanesBaseContract,
    arg: ResolveSchema<Input>
  ) => ResolveSchema<Output>
): ViewSpec<Input, Output> => ({ _t: VIEW_TAG, opcode, input, output, impl });

const defineCustomExecute = <Input extends Schema, Output extends Schema>(
  opcode: bigint,
  input: Input,
  output: Output,
  impl: (
    this: AlkanesBaseContract,
    address: string,
    arg: ResolveSchema<Input>,
    asInscription: boolean
  ) => ResolveSchema<Output>,
  asInscription = false
): ExecuteSpec<Input, Output> => ({
  _t: EXEC_TAG,
  opcode,
  input,
  output,
  asInscription,
  impl,
});

/*------------------------------------------------------------*
 | 5.  Runtime wire – injects methods at construction time     |
 *------------------------------------------------------------*/
function wireMethods(
  target: AlkanesBaseContract,
  spec: Record<string, any>
): void {
  for (const [methodName, meta] of Object.entries(spec)) {
    if (meta._t === VIEW_TAG) {
      (target as any)[methodName] = meta.impl
        ? meta.impl.bind(target)
        : (arg: ResolveSchema<typeof meta.input>) =>
            (target as any).handleView(meta.opcode, arg, meta.output);
    } else {
      (target as any)[methodName] = meta.impl
        ? (address: string, arg: ResolveSchema<typeof meta.input>) =>
            meta.impl!.call(target, address, arg, meta.asInscription)
        : (address: string, arg: ResolveSchema<typeof meta.input>) =>
            (target as any).handleExecute(
              address,
              meta.opcode,
              arg,
              meta.output,
              meta.asInscription
            );
    }
  }
}

/*------------------------------------------------------------*
 | 6. Utilities                                                |
 *------------------------------------------------------------*/
type ExtractOpcodes<T> = T extends { opcode: bigint } ? T["opcode"] : never;

/** Produce an `OpcodeTable` and check for duplicates */
function buildOpcodeTable<Spec extends Record<string, any>>(
  spec: Spec
): OpcodeTable {
  const table: Record<string, bigint> = {};
  const used: bigint[] = [];

  for (const [key, value] of Object.entries(spec)) {
    if (used.includes(value.opcode)) {
      /* Duplicate opcode at compile-time: convert to `never` to crash */
      type _Err = { DUPLICATE_OPCODE: ExtractOpcodes<typeof value> };
      //@ts-ignore
      const _check: never = _Err;
    }
    used.push(value.opcode);
    table[key] = value.opcode;
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

export const abi = {
  opcode: (code: bigint) => ({
    view: <I extends Schema>(input: I) => createViewBuilder(code, input),
    execute: <I extends Schema>(input: I, as = false) =>
      createExecuteBuilder(code, input, as),
  }),

  customView: defineCustomView,
  customExec: defineCustomExecute,
  contract,

  attach,

  extend: <A extends Record<string, any>, B extends Record<string, any>>(
    a: A,
    b: B
  ) => ({ ...a, ...b }) as A & B,
} as const;

export const TokenABI = abi.contract({
  balanceOf: abi.opcode(0n).view("string").returns("bigint"),
  transfer: abi.opcode(1n).execute("bigint").returns("boolean"),
  totalSupply: abi.customView(99n, "boolean", "bigint", function () {
    return this.alkaneId.block;
  }),
});

export const echoABI = abi
  .contract({
    echo: abi.opcode(2n).view("string").returns("string"),
    echoExecute: abi.opcode(3n).execute("string").returns("string"),
  })
  .extend(TokenABI);

export class TokenContract extends abi.attach(AlkanesBaseContract, echoABI) {}
