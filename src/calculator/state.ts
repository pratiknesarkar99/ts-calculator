import type { Operator, ValidatedDisplay, RawEntry } from "./types";
import { INITIAL_DISPLAY, toValidatedDisplay, toRawEntry, MAX_DECIMAL_PLACES, MAX_DIGITS } from "./types";

// ─── 1. WHY DISCRIMINATED UNIONS FOR STATE ───────────────────────────────────
//
// Most calculator implementations use a flat object with optional fields:
//
//   type State = {
//     display: string
//     operator?: Operator        // might exist
//     firstOperand?: number      // might exist
//     waitingForInput?: boolean  // might exist
//   }
//
// The problem: every field is always present regardless of what the
// calculator is actually doing. Nothing stops you from reading
// `firstOperand` when no operator has been entered yet. The types
// lie about what's actually valid at any given moment.
//
// Discriminated unions fix this. Each "mode" of the calculator is a
// separate type with only the fields that make sense in that mode.
// The shared `kind` field is the discriminant: a literal string type
// that TypeScript uses to narrow the union to the exact variant.
//
// The rule: if you can only reach a piece of data in one specific
// situation, it should only exist in the type for that situation.


// ─── 2. THE STATE VARIANTS ───────────────────────────────────────────────────

// The calculator is doing nothing yet, or was just fully cleared.
// Only a display value exists. No operator, no operand in memory.
type IdleState = {
    kind: "idle";
    display: ValidatedDisplay;
};

// The user has typed at least one digit. We track their raw entry
// separately from the display so we can validate before showing.
// No operator has been pressed yet.
type EnteringFirstOperandState = {
    kind: "entering_first";
    entry: RawEntry;
    display: ValidatedDisplay;
};

// An operator was pressed. We have the first operand locked in memory
// and we are waiting for the user to start typing the second number.
// `firstOperand` is a plain number here, not a string, because it has
// already been parsed and validated.
type AwaitingSecondOperandState = {
    kind: "awaiting_second";
    firstOperand: number;
    operator: Operator;
    display: ValidatedDisplay;
};

// The user has started typing the second number after pressing an operator.
type EnteringSecondOperandState = {
    kind: "entering_second";
    firstOperand: number;
    operator: Operator;
    entry: RawEntry;
    display: ValidatedDisplay;
};

// "=" was pressed and a result was computed successfully.
// We keep the result as a number so it can be used as `firstOperand`
// if the user continues chaining operations.
type ResultState = {
    kind: "result";
    result: number;
    display: ValidatedDisplay;
};

// Something went wrong: divide by zero or overflow.
// In this state, the only valid action is AC or C.
// Notice there is no `entry`, no `operator`, no `firstOperand` here.
// Trying to access those fields in this state is a compile-time error.
type ErrorState = {
    kind: "error";
    reason: "division_by_zero" | "overflow";
    display: ValidatedDisplay;
};


// ─── 3. THE UNION ────────────────────────────────────────────────────────────
//
// All six variants united into one type. This is what the rest of the
// codebase works with. `CalcState` is always exactly one of these six
// shapes at runtime. The `kind` field tells you which one.

export type CalcState =
    | IdleState
    | EnteringFirstOperandState
    | AwaitingSecondOperandState
    | EnteringSecondOperandState
    | ResultState
    | ErrorState;


// ─── 4. EXHAUSTIVENESS CHECKING ──────────────────────────────────────────────
//
// This is a standard TypeScript pattern, but worth understanding deeply.
//
// `assertNever` takes a value typed as `never`. If your switch statement
// handles every variant of a union, the `default` branch is unreachable
// and TypeScript assigns the variable the type `never` there.
//
// If you add a new variant to `CalcState` later and forget to handle it
// in a switch, the `default` branch becomes reachable again. TypeScript
// will error: "Argument of type 'NewVariant' is not assignable to
// parameter of type 'never'."
//
// Without this, forgetting a case is a silent runtime bug.
// With this, it is a loud compile-time error. That is the difference.

export function assertNever(value: never, message?: string): never {
    throw new Error(message ?? `Unhandled state variant: ${JSON.stringify(value)}`);
}


// ─── 5. INITIAL STATE ────────────────────────────────────────────────────────
//
// `satisfies CalcState` here does the same job as in types.ts.
// It validates that `initialState` is a valid CalcState without widening
// the type to the full union. TypeScript infers it as exactly `IdleState`,
// which is what we want for the initial render.

export const initialState = {
    kind: "idle",
    display: toValidatedDisplay(INITIAL_DISPLAY),
} satisfies IdleState;


// ─── 6. STATE TRANSITION HELPERS ─────────────────────────────────────────────
//
// These are pure functions. Each one takes the current state and returns
// a new state. No mutation anywhere.
//
// The key TypeScript mechanic here is NARROWING via the `kind` field.
// Inside each `if (state.kind === "...")` block, TypeScript knows
// the exact variant and only allows you to access fields that exist
// on that variant. Try accessing `state.firstOperand` inside the
// `idle` branch and the compiler will stop you.
//
// This is the payoff of discriminated unions: the type system guides
// you toward correct behavior and blocks the incorrect paths.

export function transitionOnDigit(
    state: CalcState,
    digit: string
): CalcState {
    if (state.kind === "error") return state;

    if (state.kind === "idle" || state.kind === "result") {
        const entry = toRawEntry(digit === "0" ? "0" : digit);
        return {
            kind: "entering_first",
            entry,
            display: toValidatedDisplay(entry),
        };
    }

    if (state.kind === "awaiting_second") {
        const entry = toRawEntry(digit);
        return {
            kind: "entering_second",
            firstOperand: state.firstOperand,
            operator: state.operator,
            entry,
            display: toValidatedDisplay(entry),
        };
    }

    // ── DECIMAL PLACE CAP ────────────────────────────────────────────────────
    //
    // If the current entry already has a decimal point, count how many
    // digits follow it. If we are already at MAX_DECIMAL_PLACES, ignore
    // the incoming digit entirely. This is the 3 decimal place enforcement.
    //
    // We check this before the total digit cap so both rules are applied
    // independently. A number like "123.456" has 6 total digits but hits
    // the decimal cap first.

    const raw = state.entry;

    if (raw.includes(".")) {
        const decimalPart = raw.split(".")[1] ?? "";
        if (decimalPart.length >= MAX_DECIMAL_PLACES) return state;
    }

    const digits = raw.replace(".", "").replace("-", "");
    if (digits.length >= MAX_DIGITS) return state;

    const newEntry = toRawEntry(raw === "0" ? digit : raw + digit);
    return {
        ...state,
        entry: newEntry,
        display: toValidatedDisplay(newEntry),
    };
}

export function transitionOnDecimal(state: CalcState): CalcState {
    if (state.kind === "error") return state;

    if (state.kind === "idle" || state.kind === "result") {
        return {
            kind: "entering_first",
            entry: toRawEntry("0."),
            display: toValidatedDisplay("0."),
        };
    }

    if (state.kind === "awaiting_second") {
        return {
            kind: "entering_second",
            firstOperand: state.firstOperand,
            operator: state.operator,
            entry: toRawEntry("0."),
            display: toValidatedDisplay("0."),
        };
    }

    if (state.entry.includes(".")) return state;

    const newEntry = toRawEntry(state.entry + ".");
    return { ...state, entry: newEntry, display: toValidatedDisplay(newEntry) };
}

export function transitionOnClear(state: CalcState): CalcState {
    if (state.kind === "error" || state.kind === "idle") {
        return initialState;
    }

    if (
        state.kind === "awaiting_second" ||
        state.kind === "entering_second"
    ) {
        // C while an operator is active: go back to showing first operand
        return {
            kind: "awaiting_second",
            firstOperand: state.firstOperand,
            operator: state.operator,
            display: toValidatedDisplay(String(state.firstOperand)),
        };
    }

    // entering_first or result: reset display to 0
    return initialState;
}

export function transitionOnToggleSign(state: CalcState): CalcState {
    // ── TOGGLE SIGN ──────────────────────────────────────────────────────────
    //
    // Flips the sign of whatever number is currently on the display.
    // Behavior depends on which state we are in:
    //
    //   idle             → nothing to toggle, 0 stays 0
    //   entering_first   → negate the raw entry in progress
    //   awaiting_second  → negate the first operand already locked in
    //   entering_second  → negate the raw entry in progress
    //   result           → negate the result
    //   error            → ignore
    //
    // Negating "0" is a no-op. We check for that explicitly to avoid
    // producing "-0" in the display, which is technically valid IEEE 754
    // but visually confusing and unexpected for a calculator user.
    console.log("[toggleSign] called with state:", state.kind, state);

    if (state.kind === "error" || state.kind === "idle") return state;

    if (state.kind === "entering_first" || state.kind === "entering_second") {
        if (state.entry === "0" || state.entry === "0.") return state;
        const toggled = state.entry.startsWith("-")
            ? toRawEntry(state.entry.slice(1))
            : toRawEntry("-" + state.entry);
        return {
            ...state,
            entry: toggled,
            display: toValidatedDisplay(toggled),
        };
    }

    if (state.kind === "awaiting_second") {
        if (state.firstOperand === 0) return state;
        const toggled = -state.firstOperand;
        return {
            ...state,
            firstOperand: toggled,
            display: toValidatedDisplay(String(toggled)),
        };
    }

    if (state.kind === "result") {
        if (state.result === 0) return state;
        const toggled = -state.result;
        return {
            kind: "result",
            result: toggled,
            display: toValidatedDisplay(String(toggled)),
        };
    }

    return assertNever(state);
}