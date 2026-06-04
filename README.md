# ts-calculator

A small calculator demo built with React, TypeScript, and Vite.

This repository includes a typed calculator implementation with:

- React 19 + Vite 8 frontend
- TypeScript 6 application logic
- Data-driven button layout in `src/App.tsx`
- Reducer-based calculator state in `src/calculator/logic.ts`
- Keyboard support for digits, operators, Enter, Backspace, and Escape
- Unit tests with Vitest

## Getting started

Install dependencies:

```bash
npm install
```

Start the dev server:

```bash
npm run dev
```

Open the local URL shown by Vite to view the calculator.

## Available scripts

- `npm run dev` - start the Vite development server
- `npm run build` - compile TypeScript and build production assets
- `npm run preview` - preview the production build locally
- `npm run lint` - run ESLint across the project
- `npm run test` - run unit tests with Vitest
- `npm run test:ui` - run Vitest in interactive UI mode

## Project structure

- `src/App.tsx` - calculator UI and button rendering
- `src/calculator/useCalculator.ts` - hook providing display state and action handlers
- `src/calculator/logic.ts` - calculator reducer and core logic
- `src/calculator/state.ts` - initial calculator state
- `src/calculator/types.ts` - shared operator and type definitions
- `src/index.css` - application styling

## Features

- Basic arithmetic: add, subtract, multiply, divide
- Decimal input and zero handling
- Clear entry (`C`) and all clear (`AC`)
- Keyboard shortcuts:
  - Digits `0-9`
  - Decimal `.`
  - Operators `+`, `-`, `*`, `/`
  - `Enter` / `=` for result
  - `Backspace` for clear entry
  - `Escape` for all clear

## Notes

This is a private Vite app intended as a TypeScript React demo. For stricter linting, update `eslint.config.js` with additional type-aware or React-specific ESLint rules.
