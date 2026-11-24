# Agent & contributor guide

Transact is a client-side-only personal finance and budgeting PWA: React + TypeScript, no backend.
User data lives in a versioned JSON file the user owns; the app opens, edits and saves it.

## Commands

Use **pnpm** (never npm/yarn).

| Command                         | What it does                                                                              |
| ------------------------------- | ----------------------------------------------------------------------------------------- |
| `pnpm dev`                      | Dev server                                                                                |
| `pnpm check`                    | **Run before calling any change done**: typecheck, lint, format check, tests, build       |
| `pnpm test` / `pnpm test:watch` | Vitest                                                                                    |
| `pnpm format`                   | Prettier write                                                                            |
| `pnpm build` / `pnpm preview`   | Production build (static `dist/`) and local preview                                       |
| `pnpm bench`                    | Performance benchmarks on a synthetic ~50k-transaction file (fails if a target is missed) |
| `pnpm gen:demo -- --out <file>` | Write a synthetic demo data file (`--years`, `--scale`, `--seed`, `--end`)                |

## Layout

```
src/
  app/          shell: App root, routes table, layout, theme, PWA update prompt
  domain/       pure TypeScript business logic (no React, no store) + unit tests
  store/        Zustand store, commands, undo/redo, indexes, selectors
  persistence/  codec (serialize / encrypt), storage adapters, IndexedDB working copy
  workers/      Web Workers (file load/save off the main thread)
  keyboard/     command registry, shortcuts, command palette
  components/   shared UI components
  features/     one folder per screen (home, transactions, budgets, …)
  lib/          small generic utilities (money, date, id, format)
  styles/       _tokens.scss (spacing/type/breakpoints/mixins), global.scss (color variables)
```

Navigation is driven by the single route table in `src/app/routes.ts`. Adding a screen means one
entry there plus a page component in `src/features/<name>/`.

Other single sources of truth:

- **Keyboard commands**: declare a command once in `src/keyboard/catalog.ts` (id, title, default keys),
  then attach a handler where it applies with `useCommandHandlers`. Shortcuts, the ⌘K palette, the `?`
  overlay and Settings → Keyboard all read the catalog; users can rebind any of them.
- **Settings**: declare user-facing options in `src/domain/settings/registry.ts` (file or device
  scope); the Settings screen renders them automatically. Device preferences live in
  `src/store/prefsStore.ts`.
- **Document changes**: add a command in `src/domain/commands/` and register it in
  `src/domain/commands/index.ts`. UI code calls `tryDispatch`/`tryRun` (`src/store/actions.ts`),
  which show rejected commands as toasts.

## Rules

- **Public repository: never commit personal or real financial data.** No real names, accounts,
  amounts or data files in code, tests, fixtures, screenshots or commit messages. Use synthetic
  data. Data files (`*.transact.json`) are gitignored.
- **`domain/` and `lib/` stay pure**: no React, Mantine, store or feature imports (ESLint enforces
  this). Business logic goes here so it is testable and reusable from Web Workers.
- **Money is integer cents** (`Cents`), never floats. Convert only at input/display boundaries.
- **Dates are `YYYY-MM-DD` strings** (`ISODate`), compared lexically. No time zones, no `Date` math
  on calendar dates.
- **Amounts are signed from the account's perspective**: positive = into the account. Liabilities
  carry negative balances, so net worth is a plain sum.
- **UI mutates data only through named store commands** (they power undo/redo).
- **Schema changes need a migration**: bump the schema version, add a single-step migration and a
  fixture, and keep older fixtures migrating cleanly (see `src/domain/schema/migrations/index.ts`).
  Fixtures are generated with `pnpm gen:demo` and must not be hand-formatted.
- **Access transactions through the helpers in `src/domain/model.ts`** (`getTransaction`,
  `putTransaction`, `removeTransaction`, `iterateTransactions`). They are stored in buckets so an
  edit doesn't copy the whole collection.
- **Heavy work runs in the I/O worker** (`src/workers/io.worker.ts`): parsing, migration,
  validation and serialization. Keep zod and the codec out of the main bundle.
- **Performance matters**: assume 50k+ transactions. Use indexes and incremental aggregates, virtualize
  long lists, and chart bucketed aggregates rather than raw transactions.
- **Styling**: SCSS modules co-located with components (`Foo.tsx` + `Foo.module.scss`), one component
  per file. `@use '@/styles/tokens' as *;` for sizes/breakpoints; colors via `var(--tx-*)`. No
  Tailwind or CSS-in-JS. Mantine for complex controls, themed compact (`src/app/theme.ts`).
- **Charts**: use `--tx-chart-1` for single series and `--tx-series-1…8` (in order) for
  categorical series, with `--tx-series-other` for the folded remainder. These were validated
  for contrast and color-vision differences in both themes. Never cycle colors past 8; fold into
  "Other". Every chart needs a table view, and charts plot monthly or daily totals, never raw
  transactions.
- **Information density**: compact rows (~26px), 13px base type, tabular numbers, minimal chrome and
  explanatory text.
- Keep dependencies minimal; justify any new one.
- Routing is hash-based (`#/path`) so the static build works on any host without rewrites.
