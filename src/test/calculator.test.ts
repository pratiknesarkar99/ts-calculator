import { describe, it, expect } from "vitest";
import { compute, formatResult, calcReducer } from "../calculator/logic";
import { initialState } from "../calculator/state";
import { OPERATORS, type Operator } from "../calculator/types";
import type { CalcAction } from "../calculator/logic";
import type { CalcState } from "../calculator/state";

// ─── HELPER ──────────────────────────────────────────────────────────────────
//
// Instead of chaining dispatch calls manually in every test, this helper
// takes an array of actions and runs them through the reducer in sequence,
// starting from a clean initialState.
//
// This makes test cases read like user interactions:
//   dispatch(["digit:5", "operator:+", "digit:3", "equals"])
//
// The string format is a mini DSL parsed below. It keeps the test
// cases concise without hiding what is actually happening.
// Each string maps 1:1 to a CalcAction. If you add a new action type,
// you add a new case here and the rest of the tests stay untouched.

function dispatch(actions: string[]): CalcState {
    return actions.reduce<CalcState>((state, action) => {
        const [type, payload] = action.split(":");

        let calcAction: CalcAction;

        switch (type) {
            case "digit":
                calcAction = { type: "digit", payload: payload ?? "0" };
                break;
            case "operator": {
                const opMap: Record<string, Operator> = {
                    "+": OPERATORS.ADD,
                    "-": OPERATORS.SUBTRACT,
                    "*": OPERATORS.MULTIPLY,
                    "/": OPERATORS.DIVIDE,
                };
                const op = opMap[payload ?? "+"] ?? OPERATORS.ADD;
                calcAction = { type: "operator", payload: op };
                break;
            }
            case "decimal":
                calcAction = { type: "decimal" };
                break;
            case "equals":
                calcAction = { type: "equals" };
                break;
            case "clear":
                calcAction = { type: "clear" };
                break;
            case "allClear":
                calcAction = { type: "allClear" };
                break;
            default:
                throw new Error(`Unknown test action: ${action}`);
        }

        return calcReducer(state, calcAction);
    }, initialState);
}


// ─── SECTION 1: compute() ────────────────────────────────────────────────────

describe("compute()", () => {

    describe("basic arithmetic", () => {
        it("adds two integers", () => {
            const result = compute(5, 3, OPERATORS.ADD);
            expect(result).toEqual({ ok: true, value: 8 });
        });

        it("subtracts two integers", () => {
            const result = compute(9, 4, OPERATORS.SUBTRACT);
            expect(result).toEqual({ ok: true, value: 5 });
        });

        it("multiplies two integers", () => {
            const result = compute(6, 7, OPERATORS.MULTIPLY);
            expect(result).toEqual({ ok: true, value: 42 });
        });

        it("divides two integers", () => {
            const result = compute(8, 2, OPERATORS.DIVIDE);
            expect(result).toEqual({ ok: true, value: 4 });
        });

        it("produces a negative result", () => {
            const result = compute(3, 9, OPERATORS.SUBTRACT);
            expect(result).toEqual({ ok: true, value: -6 });
        });

        it("handles zero as first operand", () => {
            const result = compute(0, 5, OPERATORS.ADD);
            expect(result).toEqual({ ok: true, value: 5 });
        });

        it("handles zero as both operands", () => {
            const result = compute(0, 0, OPERATORS.ADD);
            expect(result).toEqual({ ok: true, value: 0 });
        });
    });


    describe("division edge cases", () => {
        it("returns division_by_zero when dividing by 0", () => {
            const result = compute(5, 0, OPERATORS.DIVIDE);
            expect(result).toEqual({ ok: false, reason: "division_by_zero" });
        });

        it("returns division_by_zero when dividing 0 by 0", () => {
            const result = compute(0, 0, OPERATORS.DIVIDE);
            expect(result).toEqual({ ok: false, reason: "division_by_zero" });
        });

        it("handles non-terminating decimal division", () => {
            const result = compute(1, 3, OPERATORS.DIVIDE);
            expect(result.ok).toBe(true);
            if (result.ok) {
                // result is approximately 0.333..., integer part is 0, valid
                expect(result.value).toBeCloseTo(0.333, 3);
            }
        });
    });


    describe("overflow detection", () => {
        it("allows exactly 8 integer digits", () => {
            // 9999999 + 1 = 10000000, still 8 digits
            const result = compute(9999999, 1, OPERATORS.ADD);
            expect(result).toEqual({ ok: true, value: 10000000 });
        });

        it("returns overflow when result exceeds 8 integer digits", () => {
            // 99999999 + 1 = 100000000, that is 9 digits, overflow
            const result = compute(99999999, 1, OPERATORS.ADD);
            expect(result).toEqual({ ok: false, reason: "overflow" });
        });

        it("returns overflow for large multiplication", () => {
            const result = compute(99999, 99999, OPERATORS.MULTIPLY);
            expect(result).toEqual({ ok: false, reason: "overflow" });
        });

        it("does not overflow on decimal results with short integer part", () => {
            // integer part is 0, decimals do not count toward the limit
            const result = compute(1, 3, OPERATORS.DIVIDE);
            expect(result.ok).toBe(true);
        });
    });

});


// ─── SECTION 2: formatResult() ───────────────────────────────────────────────
//
// These tests guard against floating point display bugs.
// The values below are the classic gotchas. If formatResult() does not
// handle them, the display shows garbage and users notice immediately.

describe("formatResult()", () => {
    it("cleans up 0.1 + 0.2 floating point artifact", () => {
        const raw = 0.1 + 0.2;            // 0.30000000000000004 in JS
        expect(formatResult(raw)).toBe("0.3");
    });

    it("cleans up 7 * 1.1 floating point artifact", () => {
        const raw = 7 * 1.1;              // 7.700000000000001 in JS
        expect(formatResult(raw)).toBe("7.7");
    });

    it("strips trailing zeros from decimal results", () => {
        expect(formatResult(1.5000000)).toBe("1.5");
    });

    it("preserves integer results as clean strings", () => {
        expect(formatResult(42)).toBe("42");
    });

    it("handles negative numbers", () => {
        expect(formatResult(-6)).toBe("-6");
    });

    it("handles zero", () => {
        expect(formatResult(0)).toBe("0");
    });
});


// ─── SECTION 3: calcReducer() via dispatch helper ────────────────────────────

describe("calcReducer()", () => {

    describe("initial state", () => {
        it("starts with display 0 and kind idle", () => {
            expect(initialState.kind).toBe("idle");
            expect(String(initialState.display)).toBe("0");
        });
    });


    describe("digit entry", () => {
        it("moves to entering_first on first digit", () => {
            const state = dispatch(["digit:5"]);
            expect(state.kind).toBe("entering_first");
            expect(String(state.display)).toBe("5");
        });

        it("appends digits correctly", () => {
            const state = dispatch(["digit:1", "digit:2", "digit:3"]);
            expect(String(state.display)).toBe("123");
        });

        it("does not show a leading zero when entry starts with non-zero", () => {
            const state = dispatch(["digit:5"]);
            expect(String(state.display)).toBe("5");
        });

        it("keeps display as 0 when 0 is the only digit entered", () => {
            const state = dispatch(["digit:0"]);
            expect(String(state.display)).toBe("0");
        });

        it("ignores digits beyond the 8-digit limit", () => {
            const state = dispatch([
                "digit:1", "digit:2", "digit:3", "digit:4",
                "digit:5", "digit:6", "digit:7", "digit:8",
                "digit:9", // 9th press, should be ignored
            ]);
            expect(String(state.display)).toBe("12345678");
        });
    });


    describe("operator press", () => {
        it("moves to awaiting_second after operator", () => {
            const state = dispatch(["digit:5", "operator:+"]);
            expect(state.kind).toBe("awaiting_second");
        });

        it("locks the correct firstOperand", () => {
            const state = dispatch(["digit:4", "digit:2", "operator:+"]);
            if (state.kind !== "awaiting_second") throw new Error("wrong kind");
            expect(state.firstOperand).toBe(42);
        });

        it("swaps operator when changed before entering second operand", () => {
            const state = dispatch(["digit:5", "operator:+", "operator:*"]);
            if (state.kind !== "awaiting_second") throw new Error("wrong kind");
            expect(state.operator).toBe(OPERATORS.MULTIPLY);
        });

        it("chains: uses previous result as first operand", () => {
            // 5 + 3 = 8, then press *, state should have firstOperand 8
            const state = dispatch([
                "digit:5", "operator:+", "digit:3", "operator:*"
            ]);
            if (state.kind !== "awaiting_second") throw new Error("wrong kind");
            expect(state.firstOperand).toBe(8);
            expect(state.operator).toBe(OPERATORS.MULTIPLY);
        });
    });


    describe("equals", () => {
        it("computes a basic addition", () => {
            const state = dispatch(["digit:4", "operator:+", "digit:3", "equals"]);
            expect(state.kind).toBe("result");
            expect(String(state.display)).toBe("7");
        });

        it("computes a basic multiplication", () => {
            const state = dispatch(["digit:6", "operator:*", "digit:7", "equals"]);
            expect(state.kind).toBe("result");
            expect(String(state.display)).toBe("42");
        });

        it("does nothing when pressed from idle state", () => {
            const state = dispatch(["equals"]);
            expect(state.kind).toBe("idle");
        });

        it("does nothing when pressed right after an operator", () => {
            const state = dispatch(["digit:5", "operator:+", "equals"]);
            expect(state.kind).toBe("awaiting_second");
        });

        it("evaluates left to right, no operator precedence", () => {
            // 5 + 3 * 2: a calculator (not a spreadsheet) does (5+3)*2 = 16
            const state = dispatch([
                "digit:5", "operator:+",
                "digit:3", "operator:*",
                "digit:2", "equals",
            ]);
            expect(state.kind).toBe("result");
            if (state.kind !== "result") throw new Error("wrong kind");
            expect(state.result).toBe(16);
        });
    });


    describe("C button", () => {
        it("resets to idle from entering_first", () => {
            const state = dispatch(["digit:5", "clear"]);
            expect(state.kind).toBe("idle");
            expect(String(state.display)).toBe("0");
        });

        it("reverts to awaiting_second when pressed after operator", () => {
            const state = dispatch(["digit:5", "operator:+", "clear"]);
            expect(state.kind).toBe("awaiting_second");
            expect(String(state.display)).toBe("5");
        });

        it("reverts display to first operand when clearing mid-second-entry", () => {
            const state = dispatch(["digit:5", "operator:+", "digit:3", "clear"]);
            expect(state.kind).toBe("awaiting_second");
            expect(String(state.display)).toBe("5");
        });

        it("resets from error state", () => {
            const state = dispatch([
                "digit:5", "operator:/", "digit:0", "equals", "clear"
            ]);
            expect(state.kind).toBe("idle");
        });
    });


    describe("AC button", () => {
        it("resets to idle from any state", () => {
            const states = [
                dispatch(["allClear"]),
                dispatch(["digit:9", "allClear"]),
                dispatch(["digit:5", "operator:+", "allClear"]),
                dispatch(["digit:5", "operator:/", "digit:0", "equals", "allClear"]),
            ];
            for (const state of states) {
                expect(state.kind).toBe("idle");
                expect(String(state.display)).toBe("0");
            }
        });
    });


    describe("error states", () => {
        it("enters error on divide by zero", () => {
            const state = dispatch(["digit:5", "operator:/", "digit:0", "equals"]);
            expect(state.kind).toBe("error");
            if (state.kind !== "error") throw new Error("wrong kind");
            expect(state.reason).toBe("division_by_zero");
        });

        it("blocks digit input while in error", () => {
            const state = dispatch([
                "digit:5", "operator:/", "digit:0", "equals", "digit:9"
            ]);
            expect(state.kind).toBe("error");
        });

        it("blocks operator input while in error", () => {
            const state = dispatch([
                "digit:5", "operator:/", "digit:0", "equals", "operator:+"
            ]);
            expect(state.kind).toBe("error");
        });

        it("blocks equals input while in error", () => {
            const state = dispatch([
                "digit:5", "operator:/", "digit:0", "equals", "equals"
            ]);
            expect(state.kind).toBe("error");
        });
    });


    describe("decimal entry", () => {
        it("allows decimal point entry", () => {
            const state = dispatch(["digit:3", "decimal", "digit:5"]);
            expect(String(state.display)).toBe("3.5");
        });

        it("ignores second decimal point in same number", () => {
            const state = dispatch(["digit:3", "decimal", "decimal", "digit:5"]);
            expect(String(state.display)).toBe("3.5");
        });

        it("prefixes with 0 when decimal pressed first", () => {
            const state = dispatch(["decimal", "digit:5"]);
            expect(String(state.display)).toBe("0.5");
        });
    });

    describe("toggle sign", () => {
        it("negates a positive entry", () => {
            const state = dispatch(["digit:5", "digit:3"]);
            const toggled = calcReducer(state, { type: "toggleSign" });
            expect(String(toggled.display)).toBe("-53");
        });

        it("removes negative sign from a negative entry", () => {
            const state = dispatch(["digit:5", "digit:3"]);
            const once = calcReducer(state, { type: "toggleSign" });
            const twice = calcReducer(once, { type: "toggleSign" });
            expect(String(twice.display)).toBe("53");
        });

        it("does not toggle 0", () => {
            const state = dispatch(["digit:0"]);
            const toggled = calcReducer(state, { type: "toggleSign" });
            expect(String(toggled.display)).toBe("0");
        });

        it("toggles sign of a result", () => {
            const state = dispatch(["digit:4", "operator:+", "digit:3", "equals"]);
            const toggled = calcReducer(state, { type: "toggleSign" });
            expect(String(toggled.display)).toBe("-7");
        });

        it("does nothing in error state", () => {
            const state = dispatch(["digit:5", "operator:/", "digit:0", "equals"]);
            const toggled = calcReducer(state, { type: "toggleSign" });
            expect(toggled.kind).toBe("error");
        });
    });

    describe("decimal place cap", () => {
        it("allows up to 3 decimal places", () => {
            const state = dispatch(["digit:1", "decimal", "digit:4", "digit:1", "digit:5"]);
            expect(String(state.display)).toBe("1.415");
        });

        it("ignores a 4th decimal place", () => {
            const state = dispatch([
                "digit:1", "decimal",
                "digit:4", "digit:1", "digit:5", "digit:9"  // 9 should be ignored
            ]);
            expect(String(state.display)).toBe("1.415");
        });

        it("still enforces 8 total digit cap on integers", () => {
            const state = dispatch([
                "digit:1", "digit:2", "digit:3", "digit:4",
                "digit:5", "digit:6", "digit:7", "digit:8", "digit:9"
            ]);
            expect(String(state.display)).toBe("12345678");
        });
    });

});