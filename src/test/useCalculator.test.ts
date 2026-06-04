import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useCalculator } from "../calculator/useCalculator";

// ─── HELPERS ─────────────────────────────────────────────────────────────────
//
// Simulates a keyboard keydown event on window.
// We use `act()` from Testing Library around every interaction that
// triggers a state update. Without it, React batches the update outside
// the test's awareness and assertions run before the state settles.

function pressKey(key: string) {
    act(() => {
        window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
    });
}


// ─── SECTION 1: INITIAL STATE ────────────────────────────────────────────────

describe("useCalculator()", () => {

    describe("initial render", () => {
        it("returns display 0", () => {
            const { result } = renderHook(() => useCalculator());
            expect(result.current.display).toBe("0");
        });

        it("returns empty expression", () => {
            const { result } = renderHook(() => useCalculator());
            expect(result.current.expression).toBe("");
        });

        it("returns isError false", () => {
            const { result } = renderHook(() => useCalculator());
            expect(result.current.isError).toBe(false);
        });

        it("exposes all handlers", () => {
            const { result } = renderHook(() => useCalculator());
            const { handlers } = result.current;
            expect(typeof handlers.onDigit).toBe("function");
            expect(typeof handlers.onDecimal).toBe("function");
            expect(typeof handlers.onOperator).toBe("function");
            expect(typeof handlers.onEquals).toBe("function");
            expect(typeof handlers.onClear).toBe("function");
            expect(typeof handlers.onAllClear).toBe("function");
        });
    });


    // ─── SECTION 2: HANDLER CALLS ──────────────────────────────────────────────
    //
    // These tests call handlers directly rather than going through the keyboard.
    // That isolates the hook's dispatch wiring from the keyboard listener,
    // so a failure here points at the handler, not the event setup.

    describe("handlers", () => {
        it("onDigit updates display", () => {
            const { result } = renderHook(() => useCalculator());
            act(() => result.current.handlers.onDigit("7"));
            expect(result.current.display).toBe("7");
        });

        it("onDecimal appends decimal point", () => {
            const { result } = renderHook(() => useCalculator());
            act(() => result.current.handlers.onDigit("3"));
            act(() => result.current.handlers.onDecimal());
            act(() => result.current.handlers.onDigit("5"));
            expect(result.current.display).toBe("3.5");
        });

        it("onOperator sets expression", () => {
            const { result } = renderHook(() => useCalculator());
            act(() => result.current.handlers.onDigit("5"));
            act(() => result.current.handlers.onOperator("+"));
            expect(result.current.expression).toBe("5 +");
        });

        it("onEquals computes and clears expression", () => {
            const { result } = renderHook(() => useCalculator());
            act(() => result.current.handlers.onDigit("4"));
            act(() => result.current.handlers.onOperator("+"));
            act(() => result.current.handlers.onDigit("3"));
            act(() => result.current.handlers.onEquals());
            expect(result.current.display).toBe("7");
            expect(result.current.expression).toBe("");
        });

        it("onClear resets display to 0", () => {
            const { result } = renderHook(() => useCalculator());
            act(() => result.current.handlers.onDigit("9"));
            act(() => result.current.handlers.onClear());
            expect(result.current.display).toBe("0");
        });

        it("onAllClear resets everything", () => {
            const { result } = renderHook(() => useCalculator());
            act(() => result.current.handlers.onDigit("9"));
            act(() => result.current.handlers.onOperator("+"));
            act(() => result.current.handlers.onAllClear());
            expect(result.current.display).toBe("0");
            expect(result.current.expression).toBe("");
            expect(result.current.isError).toBe(false);
        });
    });


    // ─── SECTION 3: DISPLAY DERIVATION ────────────────────────────────────────
    //
    // Tests that `deriveDisplayProps` inside the hook produces the right
    // strings for each state variant. We drive state changes through
    // handlers and assert on the derived output, not on internal state.

    describe("display derivation", () => {
        it("shows operator in expression while awaiting second operand", () => {
            const { result } = renderHook(() => useCalculator());
            act(() => result.current.handlers.onDigit("8"));
            act(() => result.current.handlers.onOperator("*"));
            expect(result.current.expression).toContain("8");
            expect(result.current.expression).toContain("*");
        });

        it("clears expression after result", () => {
            const { result } = renderHook(() => useCalculator());
            act(() => result.current.handlers.onDigit("6"));
            act(() => result.current.handlers.onOperator("+"));
            act(() => result.current.handlers.onDigit("2"));
            act(() => result.current.handlers.onEquals());
            expect(result.current.expression).toBe("");
        });

        it("sets isError true on divide by zero", () => {
            const { result } = renderHook(() => useCalculator());
            act(() => result.current.handlers.onDigit("5"));
            act(() => result.current.handlers.onOperator("/"));
            act(() => result.current.handlers.onDigit("0"));
            act(() => result.current.handlers.onEquals());
            expect(result.current.isError).toBe(true);
        });

        it("shows division_by_zero message in expression on error", () => {
            const { result } = renderHook(() => useCalculator());
            act(() => result.current.handlers.onDigit("5"));
            act(() => result.current.handlers.onOperator("/"));
            act(() => result.current.handlers.onDigit("0"));
            act(() => result.current.handlers.onEquals());
            expect(result.current.expression).toBe("Cannot divide by zero");
        });

        it("clears error state after AC", () => {
            const { result } = renderHook(() => useCalculator());
            act(() => result.current.handlers.onDigit("5"));
            act(() => result.current.handlers.onOperator("/"));
            act(() => result.current.handlers.onDigit("0"));
            act(() => result.current.handlers.onEquals());
            act(() => result.current.handlers.onAllClear());
            expect(result.current.isError).toBe(false);
            expect(result.current.display).toBe("0");
        });
    });


    // ─── SECTION 4: KEYBOARD LISTENER ─────────────────────────────────────────
    //
    // These tests go through the actual keyboard event path, not handlers.
    // They verify the event listener is attached, the KEYBOARD_MAP lookup
    // works, and unrecognized keys are silently ignored.
    //
    // `beforeEach` / `afterEach` with `vi.spyOn` on `console.debug`
    // suppresses the CalculationTimer logs so test output stays clean.

    describe("keyboard support", () => {
        beforeEach(() => {
            vi.spyOn(console, "debug").mockImplementation(() => { });
        });

        afterEach(() => {
            vi.restoreAllMocks();
        });

        it("digit keys update display", () => {
            const { result } = renderHook(() => useCalculator());
            pressKey("5");
            expect(result.current.display).toBe("5");
        });

        it("operator keys set expression", () => {
            const { result } = renderHook(() => useCalculator());
            pressKey("4");
            pressKey("+");
            expect(result.current.expression).toContain("+");
        });

        it("Enter key triggers equals", () => {
            const { result } = renderHook(() => useCalculator());
            pressKey("3");
            pressKey("+");
            pressKey("2");
            pressKey("Enter");
            expect(result.current.display).toBe("5");
        });

        it("= key triggers equals", () => {
            const { result } = renderHook(() => useCalculator());
            pressKey("6");
            pressKey("-");
            pressKey("1");
            pressKey("=");
            expect(result.current.display).toBe("5");
        });

        it("Backspace key triggers clear", () => {
            const { result } = renderHook(() => useCalculator());
            pressKey("9");
            pressKey("Backspace");
            expect(result.current.display).toBe("0");
        });

        it("Escape key triggers allClear", () => {
            const { result } = renderHook(() => useCalculator());
            pressKey("7");
            pressKey("+");
            pressKey("Escape");
            expect(result.current.display).toBe("0");
            expect(result.current.expression).toBe("");
        });

        it("unrecognized keys do nothing", () => {
            const { result } = renderHook(() => useCalculator());
            pressKey("q");
            pressKey("F5");
            pressKey("Tab");
            expect(result.current.display).toBe("0");
        });

        it("cleans up event listener on unmount", () => {
            const removeSpy = vi.spyOn(window, "removeEventListener");
            const { unmount } = renderHook(() => useCalculator());
            unmount();
            expect(removeSpy).toHaveBeenCalledWith("keydown", expect.any(Function));
            removeSpy.mockRestore();
        });
    });

});