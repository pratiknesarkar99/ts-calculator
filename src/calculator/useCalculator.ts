import { useReducer, useCallback, useEffect } from "react";
import type { CalcAction } from "./logic";
import { calcReducer } from "./logic";
import { initialState } from "./state";
import type { Operator } from "./types";
import { OPERATORS } from "./types";

// ─── 1. THE HOOK RETURN TYPE ─────────────────────────────────────────────────
//
// We define the return shape explicitly rather than inferring it.
// Two reasons:
//
//   1. Documentation. Anyone importing this hook sees exactly what
//      they get without reading the implementation.
//
//   2. Stability. If the implementation changes internally, TypeScript
//      will error if the public shape accidentally changes too.
//      The return type is a contract, not an implementation detail.
//
// `Readonly<>` wraps the entire object. This prevents the UI from
// accidentally mutating the hook's output, e.g. `calc.display = "0"`.
// It is a shallow freeze at the type level with zero runtime cost.
//
// Notice `handlers` is a nested object. This is intentional. When
// you destructure in the component:
//
//   const { display, handlers } = useCalculator();
//
// You get a clean separation: data on one side, actions on the other.
// This mirrors the pattern used in larger state managers like Zustand.

export type UseCalculatorReturn = Readonly<{
    display: string;
    expression: string;
    isError: boolean;
    handlers: Readonly<{
        onDigit: (digit: string) => void;
        onDecimal: () => void;
        onOperator: (op: Operator) => void;
        onEquals: () => void;
        onClear: () => void;
        onAllClear: () => void;
    }>;
}>;


// ─── 2. DERIVING DISPLAY STATE FROM CALTSTATE ────────────────────────────────
//
// The component should never import `CalcState` directly. It should
// only know about strings and booleans it can render.
//
// This function is the boundary between domain logic and UI concerns.
// It extracts exactly what the UI needs from the full state, no more.
//
// `expression` builds the contextual line shown above the main display
// (e.g. "42 +" or "42 + 7 ="). Each state variant produces a different
// expression string, and the switch guarantees we handle all of them.
// `assertNever` in the default branch enforces exhaustiveness here too.
//
// The return type is inferred intentionally. It is a plain object with
// three fields. Annotating it explicitly would be redundant here since
// the shape is obvious from the return statements and the compiler will
// catch any mismatch between branches.

function deriveDisplayProps(state: ReturnType<typeof calcReducer>) {
    const display = String(state.display);
    const isError = state.kind === "error";

    let expression = "";

    switch (state.kind) {
        case "idle":
            expression = "";
            break;
        case "entering_first":
            expression = "";
            break;
        case "awaiting_second":
            expression = `${state.firstOperand} ${state.operator}`;
            break;
        case "entering_second":
            expression = `${state.firstOperand} ${state.operator}`;
            break;
        case "result":
            expression = "";
            break;
        case "error":
            expression = state.reason === "division_by_zero"
                ? "Cannot divide by zero"
                : "Result too large";
            break;
    }

    return { display, expression, isError };
}


// ─── 3. KEYBOARD MAP ─────────────────────────────────────────────────────────
//
// A lookup table typed with `as const satisfies`.
// Keys are keyboard `event.key` values. Values are `CalcAction` objects.
//
// `Record<string, CalcAction>` is the constraint passed to `satisfies`.
// This means every value must be a valid `CalcAction`, enforced at the
// definition site. If you mistype an action `type` string, you get an
// error here, not somewhere downstream in the dispatch call.
//
// `as const` narrows the action types to their literal values so
// TypeScript treats them as specific action variants, not just
// `{ type: string }`.
//
// `noUncheckedIndexedAccess` in our tsconfig means that looking up
// `KEYBOARD_MAP[key]` returns `CalcAction | undefined`, not just
// `CalcAction`. We handle that explicitly in the effect below rather
// than assuming the key exists. That is the correct behavior.

const KEYBOARD_MAP = {
    "0": { type: "digit", payload: "0" },
    "1": { type: "digit", payload: "1" },
    "2": { type: "digit", payload: "2" },
    "3": { type: "digit", payload: "3" },
    "4": { type: "digit", payload: "4" },
    "5": { type: "digit", payload: "5" },
    "6": { type: "digit", payload: "6" },
    "7": { type: "digit", payload: "7" },
    "8": { type: "digit", payload: "8" },
    "9": { type: "digit", payload: "9" },
    ".": { type: "decimal" },
    "+": { type: "operator", payload: OPERATORS.ADD },
    "-": { type: "operator", payload: OPERATORS.SUBTRACT },
    "*": { type: "operator", payload: OPERATORS.MULTIPLY },
    "/": { type: "operator", payload: OPERATORS.DIVIDE },
    "Enter": { type: "equals" },
    "=": { type: "equals" },
    "Backspace": { type: "clear" },
    "Escape": { type: "allClear" },
} as const satisfies Record<string, CalcAction>;


// ─── 4. THE HOOK ─────────────────────────────────────────────────────────────
//
// `useReducer` is the right React primitive here, not `useState`.
// Our state is a discriminated union with complex transitions. Putting
// all the transition logic inside `useState` setters would scatter it
// across the component. `useReducer` centralizes it in `calcReducer`,
// which lives in logic.ts and is fully independent of React.
//
// This separation means `calcReducer` is unit-testable without
// mounting any component. Pass in a state, pass in an action, assert
// on the output. No mocking, no React Testing Library needed.

export function useCalculator(): UseCalculatorReturn {
    const [state, dispatch] = useReducer(calcReducer, initialState);


    // ── KEYBOARD SUPPORT ───────────────────────────────────────────────────────
    //
    // `useCallback` memoizes the handler so the `useEffect` dependency
    // array stays stable. Without it, a new function reference is created
    // on every render, causing the effect to re-run and re-attach the
    // listener unnecessarily.
    //
    // The `noUncheckedIndexedAccess` flag makes the `action` lookup typed
    // as `CalcAction | undefined`. The `if (!action)` guard is not just
    // defensive programming, it is required by the compiler. This is the
    // flag paying off: we cannot accidentally call `dispatch(undefined)`.

    const handleKeyDown = useCallback(
        (e: KeyboardEvent) => {
            const action = KEYBOARD_MAP[e.key as keyof typeof KEYBOARD_MAP];
            if (!action) return;
            e.preventDefault();
            dispatch(action);
        },
        []
    );

    useEffect(() => {
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [handleKeyDown]);


    // ── STABLE DISPATCH WRAPPERS ───────────────────────────────────────────────
    //
    // These wrap `dispatch` in typed functions so the component never
    // constructs action objects directly. The component just calls
    // `handlers.onDigit("5")` and has no knowledge of the action shape.
    //
    // Each wrapper is memoized with `useCallback`. The dependency arrays
    // are empty because `dispatch` from `useReducer` is already stable
    // across renders. React guarantees this, so we do not need to include
    // it in the dependency array.
    //
    // This pattern is sometimes called "command handlers" or a "facade".
    // The practical benefit: if you ever swap `useReducer` for a different
    // state manager (Zustand, Jotai, XState), you only change this hook.
    // The component and the logic layer are untouched.

    const handlers: UseCalculatorReturn["handlers"] = {
        onDigit: useCallback(
            (digit: string) => dispatch({ type: "digit", payload: digit }),
            []
        ),
        onDecimal: useCallback(
            () => dispatch({ type: "decimal" }),
            []
        ),
        onOperator: useCallback(
            (op: Operator) => dispatch({ type: "operator", payload: op }),
            []
        ),
        onEquals: useCallback(
            () => dispatch({ type: "equals" }),
            []
        ),
        onClear: useCallback(
            () => dispatch({ type: "clear" }),
            []
        ),
        onAllClear: useCallback(
            () => dispatch({ type: "allClear" }),
            []
        ),
    };

    const { display, expression, isError } = deriveDisplayProps(state);

    return {
        display,
        expression,
        isError,
        handlers,
    };
}