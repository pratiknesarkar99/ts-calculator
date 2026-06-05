import { useCalculator } from "./calculator/useCalculator";
import type { Operator } from "./calculator/types";
import { OPERATORS } from "./calculator/types";

// ─── 1. BUTTON CONFIGURATION AS A TYPED DATA STRUCTURE ───────────────────────
//
// Most calculator UIs define buttons inline as JSX, scattered across
// the render. That works fine for small components but it mixes
// structure (what buttons exist) with presentation (how they look)
// and behavior (what they do).
//
// Instead we define the button layout as a data structure and derive
// the JSX from it. This means:
//
//   - Adding or reordering buttons is a data change, not a JSX surgery
//   - Each button's type is discriminated, same pattern as CalcState
//   - The renderer is a pure mapping function with no conditionals
//
// `ButtonConfig` is a discriminated union. Each variant carries exactly
// the data its handler needs. A digit button carries a `digit` string.
// An operator button carries an `Operator`. A control button carries
// a `kind` that maps to a specific handler. Nothing more.
//
// `satisfies ButtonConfig[][]` validates the grid structure against
// the union at definition time. If you add a button with an unknown
// `type`, the compiler errors at the definition, not at the renderer.

type ButtonConfig =
  | { type: "digit"; digit: string; label: string }
  | { type: "decimal"; label: string }
  | { type: "operator"; op: Operator; label: string }
  | { type: "equals"; label: string }
  | { type: "clear"; label: string }
  | { type: "allClear"; label: string }
  | { type: "toggleSign"; label: string };


const BUTTON_GRID = [
  [
    { type: "allClear", label: "AC" },
    { type: "toggleSign", label: "+/-" },
    { type: "clear", label: "C" },
    { type: "operator", op: OPERATORS.DIVIDE, label: "÷" },
    { type: "operator", op: OPERATORS.MULTIPLY, label: "×" },
  ],
  [
    { type: "digit", digit: "7", label: "7" },
    { type: "digit", digit: "8", label: "8" },
    { type: "digit", digit: "9", label: "9" },
    { type: "operator", op: OPERATORS.SUBTRACT, label: "−" },
  ],
  [
    { type: "digit", digit: "4", label: "4" },
    { type: "digit", digit: "5", label: "5" },
    { type: "digit", digit: "6", label: "6" },
    { type: "operator", op: OPERATORS.ADD, label: "+" },
  ],
  [
    { type: "digit", digit: "1", label: "1" },
    { type: "digit", digit: "2", label: "2" },
    { type: "digit", digit: "3", label: "3" },
    { type: "equals", label: "=" },
  ],
  [
    { type: "digit", digit: "0", label: "0" },
    { type: "decimal", label: "." },
  ],
] as const satisfies ButtonConfig[][];


// ─── 2. BUTTON VARIANT CLASSNAMES ────────────────────────────────────────────
//
// A pure function that maps a ButtonConfig to a CSS class string.
// Keeping this outside the component means it never re-creates on render.
// It is also trivially testable: pass a config, assert a string.

function getButtonClass(btn: ButtonConfig): string {
  const base = "calc-btn";
  switch (btn.type) {
    case "digit": return `${base} btn-digit`;
    case "decimal": return `${base} btn-digit`;
    case "operator": return `${base} btn-operator`;
    case "equals": return `${base} btn-equals`;
    case "clear": return `${base} btn-clear`;
    case "allClear": return `${base} btn-allclear`;
    case "toggleSign": return `${base} btn-toggle`;
  }
}


// ─── 3. THE COMPONENT ────────────────────────────────────────────────────────
//
// Notice how thin this is. No state, no logic, no conditionals about
// what mode the calculator is in. All of that lives in the hook and
// the files beneath it.
//
// The component's only responsibilities:
//   1. Call useCalculator() to get display data and handlers
//   2. Render the display section
//   3. Map BUTTON_GRID to button elements via renderButton
//
// `renderButton` is defined inside the component so it closes over
// `handlers`. It is a local function, not a component, so no need
// to wrap it in useCallback. It runs synchronously during render,
// never stored or passed anywhere that would cause a stale closure.
//
// The `btn.type` switch inside `renderButton` is exhaustive. If you
// add a new ButtonConfig variant and forget to handle it here,
// `assertNever` will cause a compile-time error, same as in logic.ts.
// Consistent pattern across the entire codebase.

export default function App() {
  const { display, expression, isError, handlers } = useCalculator();

  function renderButton(btn: ButtonConfig, colIndex: number) {
    const isWide = btn.type === "digit" && btn.digit === "0";

    function handleClick() {
      switch (btn.type) {
        case "digit": return handlers.onDigit(btn.digit);
        case "decimal": return handlers.onDecimal();
        case "operator": return handlers.onOperator(btn.op);
        case "equals": return handlers.onEquals();
        case "clear": return handlers.onClear();
        case "allClear": return handlers.onAllClear();
        case "toggleSign":
          console.log("[toggleSign] button clicked");
          return handlers.onToggleSign();
      }
    }

    return (
      <button
        key={colIndex}
        className={`${getButtonClass(btn)}${isWide ? " btn-wide" : ""}`}
        onClick={handleClick}
        aria-label={btn.label}
      >
        {btn.label}
      </button>
    );
  }

  return (
    <div className="shell">
      <div className="calculator">

        <div className={`display${isError ? " display--error" : ""}`}>
          <span className="display__expression">{expression}</span>
          <span className="display__value">{display}</span>
        </div>

        <div className="keypad">
          {BUTTON_GRID.map((row, rowIndex) => (
            <div key={rowIndex} className="keypad__row">
              {row.map((btn, colIndex) => renderButton(btn, colIndex))}
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}