// ─── 1. TEMPLATE LITERAL TYPES ───────────────────────────────────────────────
//
// Instead of typing operator as plain `string`, we define exactly which
// strings are valid. The pipe `|` unions them into one type.
// This is not new to 5.8, but combined with `as const satisfies` below,
// it becomes the modern replacement for enums.

export type Operator = "+" | "-" | "*" | "/";
export type DigitChar = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9";


// ─── 2. `as const satisfies` ─────────────────────────────────────────────────
//
// Old approach (don't do this in 2026):
//   enum Operator { Add = "+", Sub = "-" ... }
//
// Why not enums?
//   - They emit runtime JavaScript (not erasable)
//   - `erasableSyntaxOnly: true` in our tsconfig will hard-error on them
//   - They don't play well with Node.js native type stripping
//
// Modern approach: `as const satisfies`
//   - `as const`   → infers the narrowest literal types ("+" not string)
//   - `satisfies`  → validates the shape against a type WITHOUT widening it
//                    (added in TS 4.9, still underused in most codebases)
//
// The result: you get enum-like autocomplete and safety, zero runtime cost.

export const OPERATORS = {
    ADD: "+",
    SUBTRACT: "-",
    MULTIPLY: "*",
    DIVIDE: "/",
} as const satisfies Record<string, Operator>;

export const MAX_DIGITS = 8 as const;
export const MAX_DECIMAL_PLACES = 3 as const;
export const ERROR_DISPLAY = "ERR" as const;
export const INITIAL_DISPLAY = "0" as const;


// ─── 3. BRANDED (NOMINAL) TYPES ──────────────────────────────────────────────
//
// TypeScript's type system is structural, not nominal.
// That means `type Meters = number` and `type Seconds = number` are
// interchangeable to the compiler. You can accidentally pass seconds
// where meters are expected and TypeScript won't catch it.
//
// Branding solves this. We attach a phantom tag via an intersection type.
// The tag `{ readonly __brand: "ValidatedDisplay" }` only exists in the
// type system, it compiles away to nothing at runtime.
//
// This means:
//   - A plain `string` cannot be assigned to `ValidatedDisplay` directly
//   - You MUST go through the `brand()` helper, which acts as a checkpoint
//   - Anyone reading the code sees exactly what kind of string is expected

declare const __brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [__brand]: B };

export type ValidatedDisplay = Brand<string, "ValidatedDisplay">;
export type RawEntry = Brand<string, "RawEntry">;


// ─── 4. BRAND CONSTRUCTOR HELPERS ────────────────────────────────────────────
//
// These are the only places where a plain value becomes a branded value.
// Think of them as smart constructors. They encode validation rules once,
// so the rest of the codebase can trust the type completely.
//
// TS 5.8 note: the return type annotation here benefits from the improved
// granular return-type checking. If a branch forgets to return a
// ValidatedDisplay, the compiler now catches it precisely at that branch
// rather than at the function level, making the error message actionable.

export function toValidatedDisplay(value: string): ValidatedDisplay {
    const digits = value.replace(".", "").replace("-", "");
    if (digits.length > MAX_DIGITS) {
        return ERROR_DISPLAY as ValidatedDisplay;
    }
    return value as ValidatedDisplay;
}

export function toRawEntry(value: string): RawEntry {
    return value as RawEntry;
}


// ─── 5. RESULT TYPE (POOR MAN'S EITHER) ──────────────────────────────────────
//
// A common pattern borrowed from functional languages (Rust's Result<T,E>,
// Haskell's Either). Instead of throwing exceptions or returning null,
// functions return an explicit Ok or Err variant.
//
// This is a discriminated union (more on those in state.ts), but here it
// wraps a computation outcome. The discriminant is the `ok` boolean.
//
// Why this matters: our `compute()` function in logic.ts can fail (divide
// by zero, overflow). Returning `CalcResult` forces every caller to handle
// both cases. You cannot access `.value` without first checking `.ok`.

export type CalcResult =
    | { ok: true; value: number }
    | { ok: false; reason: "division_by_zero" | "overflow" };