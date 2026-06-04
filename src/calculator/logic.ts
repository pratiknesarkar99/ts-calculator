import type { Operator, CalcResult } from "./types";
import { MAX_DIGITS, OPERATORS } from "./types";
import type { CalcState } from "./state";
import {
    initialState,
    assertNever,
    transitionOnDigit,
    transitionOnDecimal,
    transitionOnClear,
} from "./state";
import { toValidatedDisplay, toRawEntry } from "./types";

// ─── 1. THE COMPUTE FUNCTION: TS 5.8 GRANULAR RETURN TYPE CHECKING ───────────
//
// This is where TypeScript 5.8 visibly improves on earlier versions.
//
// Before 5.8, conditional return type checking was coarse. If a function
// declared `CalcResult` as its return type, the compiler would check the
// overall shape but sometimes miss branch-level mismatches, giving you
// a vague error pointing at the function signature instead of the
// specific branch that was wrong.
//
// In 5.8, each branch of a conditional inside a return statement is
// checked individually against the declared return type. The error
// lands exactly on the branch that is wrong, not on the function.
//
// Try it: change `ok: true` to `ok: false` in the success branch below.
// The error will point precisely at that object literal, not at the
// function declaration. That is the 5.8 improvement in practice.
//
// The function itself is pure: same inputs always produce same output.
// No side effects, no state mutation. Easy to unit test in isolation.

export function compute(
    firstOperand: number,
    secondOperand: number,
    operator: Operator
): CalcResult {
    if (operator === OPERATORS.DIVIDE && secondOperand === 0) {
        return { ok: false, reason: "division_by_zero" };
    }

    let result: number;

    switch (operator) {
        case OPERATORS.ADD:
            result = firstOperand + secondOperand;
            break;
        case OPERATORS.SUBTRACT:
            result = firstOperand - secondOperand;
            break;
        case OPERATORS.MULTIPLY:
            result = firstOperand * secondOperand;
            break;
        case OPERATORS.DIVIDE:
            result = firstOperand / secondOperand;
            break;
        default:
            // assertNever fires here if a new Operator variant is added
            // to types.ts but this switch is not updated. Compile-time safety
            // instead of a silent runtime passthrough.
            return assertNever(operator);
    }

    // ── OVERFLOW CHECK ────────────────────────────────────────────────────────
    //
    // We check the integer part only. A result of 12345678.99 is fine.
    // A result of 123456789 is overflow, regardless of decimal digits.
    // `Math.trunc` strips the decimal before we measure length.

    const integerPart = Math.abs(Math.trunc(result)).toString();
    if (integerPart.length > MAX_DIGITS) {
        return { ok: false, reason: "overflow" };
    }

    return { ok: true, value: result };
}


// ─── 2. FORMAT RESULT FOR DISPLAY ────────────────────────────────────────────
//
// Numbers need cleanup before they hit the screen.
// Floating point arithmetic produces artifacts: 0.1 + 0.2 = 0.30000000000004
// We round to 8 significant figures to eliminate the noise while
// keeping results accurate enough for a standard calculator.
//
// `toPrecision(8)` returns a string. We then pass it through
// `parseFloat` to strip trailing zeros (0.50000000 → 0.5),
// then back to string for display.

export function formatResult(value: number): string {
    const rounded = parseFloat(value.toPrecision(MAX_DIGITS));
    return String(rounded);
}


// ─── 3. THE `using` KEYWORD: EXPLICIT RESOURCE MANAGEMENT ───────────────────
//
// `using` was introduced in TypeScript 5.2 and stabilized through 5.7/5.8.
// It implements the TC39 "Explicit Resource Management" proposal.
//
// The core idea: any object that implements `Symbol.dispose` will have
// that method called automatically when the variable goes out of scope,
// similar to `with` statements in Python or `using` in C#.
//
// In production you'd use this for: database connections, file handles,
// event listeners, timers, WebSockets, anything that needs cleanup.
//
// Here we use it for a `CalculationTimer`: a lightweight object that
// records how long a computation takes and logs it when it goes out of
// scope. It is a realistic, non-contrived use case for a dev tool.
// In a real app you would send this to an analytics or observability
// service instead of console.log.
//
// The `[Symbol.dispose]` method is what makes an object `using`-compatible.
// TypeScript enforces this via the built-in `Disposable` interface.

class CalculationTimer implements Disposable {
    private readonly label: string;
    private readonly start: number;

    constructor(label: string) {
        this.label = label;
        this.start = performance.now();
    }

    [Symbol.dispose](): void {
        const elapsed = (performance.now() - this.start).toFixed(3);
        console.debug(`[calc] ${this.label} completed in ${elapsed}ms`);
    }
}


// ─── 4. OPERATOR TRANSITION ──────────────────────────────────────────────────
//
// Called when the user presses +, -, *, or /.
// The behavior depends on the current state:
//
//   idle / result          → lock in the display value as firstOperand
//   entering_first         → parse entry, lock it in, await second
//   awaiting_second        → user changed their mind about the operator,
//                            just swap it out, stay in awaiting_second
//   entering_second        → chain: compute what we have so far,
//                            use that result as the new firstOperand
//   error                  → ignore all input
//
// Notice that each branch only accesses fields that exist on that
// specific state variant. This is narrowing enforced by the union.
// Try reading `state.firstOperand` inside the `idle` branch and
// the compiler will tell you it does not exist on `IdleState`.

export function transitionOnOperator(
    state: CalcState,
    operator: Operator
): CalcState {
    if (state.kind === "error") return state;

    switch (state.kind) {
        case "idle":
        case "result": {
            const value = state.kind === "result"
                ? state.result
                : parseFloat(state.display);
            return {
                kind: "awaiting_second",
                firstOperand: value,
                operator,
                display: state.display,
            };
        }

        case "entering_first": {
            const value = parseFloat(state.entry);
            return {
                kind: "awaiting_second",
                firstOperand: value,
                operator,
                display: state.display,
            };
        }

        case "awaiting_second": {
            // Just swap the operator, nothing else changes
            return { ...state, operator };
        }

        case "entering_second": {
            // Chain: compute first, then set up for the next operation
            using timer = new CalculationTimer(
                `${state.firstOperand} ${state.operator} ${state.entry}`
            );
            void timer;

            const second = parseFloat(state.entry);
            const result = compute(state.firstOperand, second, state.operator);

            if (!result.ok) {
                return {
                    kind: "error",
                    reason: result.reason,
                    display: toValidatedDisplay("ERR"),
                };
            }

            const formatted = formatResult(result.value);
            return {
                kind: "awaiting_second",
                firstOperand: result.value,
                operator,
                display: toValidatedDisplay(formatted),
            };
        }

        default:
            return assertNever(state);
    }
}


// ─── 5. EQUALS TRANSITION ────────────────────────────────────────────────────
//
// Called when the user presses "=".
// Only meaningful in `entering_second`. Every other state either has
// nothing to compute or is already showing a result.
//
// The `using` keyword appears again here. When this function returns,
// the `timer` variable goes out of scope and `[Symbol.dispose]` is
// called automatically. You do not call cleanup manually.
// This is what makes `using` different from a plain `const` with a
// manual `.stop()` call: the runtime guarantees cleanup even if an
// exception is thrown between construction and end of scope.

export function transitionOnEquals(state: CalcState): CalcState {
    if (state.kind !== "entering_second") return state;

    using timer = new CalculationTimer(
        `${state.firstOperand} ${state.operator} ${state.entry}`
    );
    void timer;

    const second = parseFloat(state.entry);
    const result = compute(state.firstOperand, second, state.operator);

    if (!result.ok) {
        return {
            kind: "error",
            reason: result.reason,
            display: toValidatedDisplay("ERR"),
        };
    }

    const formatted = formatResult(result.value);
    return {
        kind: "result",
        result: result.value,
        display: toValidatedDisplay(formatted),
    };
}


// ─── 6. MAIN DISPATCH ────────────────────────────────────────────────────────
//
// A single function the hook will call for every user action.
// It takes the current state and an action, returns the next state.
// This is the same shape as a React `useReducer` reducer, which is
// exactly how we will wire it up in `useCalculator.ts`.
//
// The action is a discriminated union itself (same pattern as CalcState).
// Each variant carries exactly the payload that action needs and nothing
// more. A `digit` action carries the digit string. A `clear` action
// carries nothing. TypeScript enforces this at every call site.

export type CalcAction =
    | { type: "digit"; payload: string }
    | { type: "decimal" }
    | { type: "operator"; payload: Operator }
    | { type: "equals" }
    | { type: "clear" }
    | { type: "allClear" };

export function calcReducer(state: CalcState, action: CalcAction): CalcState {
    switch (action.type) {
        case "digit":
            return transitionOnDigit(state, action.payload);
        case "decimal":
            return transitionOnDecimal(state);
        case "operator":
            return transitionOnOperator(state, action.payload);
        case "equals":
            return transitionOnEquals(state);
        case "clear":
            return transitionOnClear(state);
        case "allClear":
            return initialState;
        default:
            return assertNever(action);
    }
}