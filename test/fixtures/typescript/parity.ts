// Fixture for TypeScriptAdapter parity check (v0.2 Stream A #4).
//
// Exercises TS-specific pathology surfaced during the Phase C hono
// spot-check. Tests against this fixture live in `typescript.test.ts`
// under the "parity (v0.2 Stream A #4)" describe block.
//
// Kept isolated from `sample.ts` so existing tests (findReferences,
// kind mapping of basic shapes) remain unaffected.

// ---------------------------------------------------------------------
// Gap 1: class members must be surfaced as symbols (parity with Python
// adapter's children iteration for kind=5).
// ---------------------------------------------------------------------

export class ParityClass {
  readonly id: string;

  constructor(id: string) {
    this.id = id;
  }

  instanceMethod(): string {
    return this.id;
  }

  static staticMethod(): number {
    return 42;
  }
}

// ---------------------------------------------------------------------
// Gap 1 extended: interface members must also be surfaced (interfaces
// are a first-class TS construct with member signatures worth
// resolving claims against).
// ---------------------------------------------------------------------

export interface ParityInterface {
  requiredProp: string;
  optionalProp?: number;
  methodSig(arg: string): boolean;
}

// ---------------------------------------------------------------------
// Gap 2: namespace children must be surfaced (hono's JSX namespace
// exhibits this pattern at scale).
// ---------------------------------------------------------------------

export namespace ParityNamespace {
  export interface Inner {
    innerField: number;
  }

  export type InnerAlias = string | number;
}

// ---------------------------------------------------------------------
// Gap 5: type-alias signature must not bleed into the next declaration
// when ASI convention is used (no trailing `;`). `FirstTypeAlias`
// below has no semicolon; `SecondTypeAlias` starts on the next line.
// The extractor must terminate before the next declaration.
// ---------------------------------------------------------------------

export type FirstTypeAlias = Record<string, number>

export type SecondTypeAlias = {
  x: number
  y: number
}

// ---------------------------------------------------------------------
// Gap 3 surface (investigation time-boxed): complex class signature
// with generic parameters spanning multiple lines. Exists in the
// fixture so the Gap 3 investigation has a concrete shape to probe.
// ---------------------------------------------------------------------

export class GenericHost<
  T extends ParityInterface,
  U = string,
> {
  stored: T;

  constructor(value: T) {
    this.stored = value;
  }
}

// ---------------------------------------------------------------------
// Gap 4 surface (deferred to v0.3): arrow-function export. Exists in
// the fixture as a future-regression anchor; target behavior not
// enforced in v0.2 tests.
// ---------------------------------------------------------------------

export const arrowExport = (x: number): number => x * 2;
