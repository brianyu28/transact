# Transact architecture

This document explains how Transact is built: where data lives, how it is shaped and versioned,
and how the ledger, balances, budgets, statements, reports and planner work.

## Contents

1. [Principles](#1-principles)
2. [Code map](#2-code-map)
3. [Data flow](#3-data-flow)
4. [The data file](#4-the-data-file)
5. [Schema versioning and migrations](#5-schema-versioning-and-migrations)
6. [The in-memory model](#6-the-in-memory-model)
7. [Commands, undo and redo](#7-commands-undo-and-redo)
8. [Indexes and aggregates](#8-indexes-and-aggregates)
9. [Transactions](#9-transactions)
10. [Balances and net worth](#10-balances-and-net-worth)
11. [Budgets](#11-budgets)
12. [Statements and reconciliation](#12-statements-and-reconciliation)
13. [Reports](#13-reports)
14. [Planner](#14-planner)
15. [Persistence, sync and encryption](#15-persistence-sync-and-encryption)
16. [UI conventions](#16-ui-conventions)
17. [Recipes](#17-recipes)

## 1. Principles

- **No backend.** Transact is a static site. All logic runs in the browser and all data lives in a
  JSON file the user owns. The optional Dropbox sync talks to Dropbox directly from the browser.
- **The file contains all data.** Its format is documented, versioned and migrated forward forever. A
  file written by any past version must open in every later version.
- **Fast at scale.** Assume 50,000+ transactions. Nothing on the interactive path scans all
  transactions. Indexes update incrementally, lists are virtualized, and charts plot pre-bucketed
  totals.
- **Pure core.** Business rules live in `src/domain/`, which imports no React, no store and no UI
  library. That keeps the rules unit-testable and lets the Web Worker run them.
- **Exact money.** Amounts are integer cents and dates are `YYYY-MM-DD` strings. There is no
  floating-point money and no time zones.

## 2. Code map

```
src/
  app/          App root, route table, layout, theme, file menu and file dialogs
  domain/       Pure business logic and its unit tests
    schema/       zod schema (current.ts), types, versions, migrations, fixtures, integrity checks
    model.ts      In-memory document shape and transaction bucket helpers
    commands/     Every document mutation, as a named command
    aggregates/   DocIndex (incremental indexes), balances, lookups, chart sampling
    transactions/ Splits, the filter language, register queries
    budgets/      Periods, the assignment engine, budget views and rollover
    statements/   Reconciliation
    reports/      Report calculations over monthly rollups
    planner/      Tax and income engine, plus templates
    sync/         Three-way document merge
    settings/     Registry of user-facing settings
    demo/         Synthetic data generator (demo mode, fixtures, benchmarks)
  store/        Zustand stores: document + undo, session (file I/O), prefs, UI state, toasts
  persistence/  Codec (serialize, encrypt), storage adapters, IndexedDB working copy, worker client
  workers/      io.worker.ts: parse, migrate, validate and serialize off the main thread
  keyboard/     Command catalog, key bindings, dispatcher, command palette
  components/   Shared UI components (charts, inputs, sortable lists)
  features/     One folder per screen: home, transactions, accounts, budgets, statements,
                reports, planner, settings
  lib/          Small pure utilities: money, dates, ids, formatting
  styles/       SCSS tokens and global color variables
scripts/        gen-demo.ts (synthetic data files)
bench/          Performance benchmarks against a synthetic 50k-transaction file
```

ESLint enforces the layering. `domain/` and `lib/` may not import from `store/`, `features/`,
`components/`, `app/`, React or Mantine.

## 3. Data flow

```
 file bytes ──▶ [worker] decode: unwrap JSON → migrate → validate (zod) → DocModel
                                                                       │
                     UI ──dispatch(command)──▶ docStore (Immer) ───────┤
                      ▲                          │ patches              │
                      │                          ▼                      ▼
                      └──── selectors ◀── DocIndex (incremental)   working copy (IndexedDB)
                                                                       │
 file bytes ◀── [worker] encode ◀── session.save() ◀───────────────────┘
```

1. **Open.** A storage adapter returns raw bytes. If the bytes are an encrypted envelope, the
   session decrypts them first (see §15). The I/O worker parses the JSON, migrates it to the
   current schema version, validates it with zod, runs integrity checks and converts it to the
   in-memory `DocModel`.
2. **Edit.** UI code calls `tryDispatch(name, payload)`. That runs a command inside Immer, records
   patches for undo, and updates the `DocIndex` from the patches.
3. **Autosave locally.** Every edit schedules a debounced write of the whole document to IndexedDB
   (the _working copy_). Closing the tab never loses edits.
4. **Save.** `session.save()` serializes in the worker, encrypts if enabled, and writes through the
   adapter. A revision check detects changes made elsewhere (see §15).

## 4. The data file

A data file (`*.transact.json`) is a single JSON object:

```jsonc
{
  "format": "transact",
  "schemaVersion": 2,
  "meta": { "fileId", "revision", "createdAt", "savedAt", "savedBy", "appVersion" },
  "settings": { "currency", "locale", "weekStartsOn", "budgetYearStartMonth", "budget": {…}, "reconcileGraceDays" },
  "accounts": [ … ],
  "categories": [ … ],
  "tags": [ … ],
  "transactions": [ … ],
  "balanceSnapshots": [ … ],
  "statements": [ … ],
  "budgets": { "template": { "lines": [ … ] }, "periods": [ … ], "custom": [ … ] },
  "planner": { "scenarios": [ … ] },
  "tombstones": [ { "id", "deletedAt" } ]
}
```

The authoritative definition is `src/domain/schema/current.ts`. TypeScript types are inferred from
it (`schema/types.ts`), so types and validation cannot drift apart.

### Conventions

| Concept         | Representation                                                                                                                                                                               |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Money           | Integer cents (`Cents`). Convert only at input and display boundaries (`lib/money.ts`).                                                                                                      |
| Calendar dates  | `YYYY-MM-DD` strings (`ISODate`), compared lexically. Never use `Date` arithmetic on them.                                                                                                   |
| Timestamps      | ISO 8601 with offset, used for `createdAt`, `updatedAt`, `savedAt` and tombstones.                                                                                                           |
| Ids             | `<kind>_<random>`, e.g. `txn_…`, `acc_…`, `cat_…`, `tag_…` (`lib/id.ts`). Ids are never reused.                                                                                              |
| Sign            | From the account's perspective: positive means money into the account. A purchase on a credit card is negative, and liabilities carry negative balances. Net worth is therefore a plain sum. |
| Optional fields | Omitted when they hold the default (`false`, empty). Code treats `undefined` as the default. Flags are `z.literal(true).optional()`.                                                         |
| Ordering        | User-orderable entities carry a numeric `order`. Arrays in the file are written in a canonical order so diffs stay small.                                                                    |
| Deletion        | Removing an entity adds a tombstone `{ id, deletedAt }`, so a merge can tell "deleted" from "never existed".                                                                                 |
| `updatedAt`     | Every entity has one. The merge uses it to explain conflicts.                                                                                                                                |

### Entities

- **Account**: `type` is one of checking, savings, credit, brokerage, retirement, cash, loan,
  property or other. Credit and loan are liabilities (`LIABILITY_ACCOUNT_TYPES`). Closed accounts
  stay in the file.
- **Category**: a tree via `parentId`. `kind` (`income` or `expense`, default `expense`) is set on
  top-level categories and inherited by their children.
- **Tag**: a flat label. Transactions and splits reference tags by id.
- **Transaction**: see §9.
- **BalanceSnapshot**: "the balance at the _start_ of `date`". Snapshots are entered by hand or
  produced by a statement (see §10).
- **Statement**: a date range with opening and closing balances, plus a status (see §12).
- **Budget template, periods and custom budgets**: see §11.
- **Planner scenario**: see §14.

## 5. Schema versioning and migrations

- `CURRENT_SCHEMA_VERSION` (`schema/version.ts`) is the version this build reads and writes.
- **There is exactly one schema module, `current.ts`.** Older versions do not exist as code. They
  exist as **fixtures** (`schema/fixtures/vN.json`) plus **migrations**
  (`schema/migrations/vN-to-vN+1.ts`).
- A migration upgrades raw JSON by exactly one version. It works on plain objects, never on
  current types, so old migrations keep compiling as the schema changes.
- When a file loads, migrations run in sequence up to the current version, and then the result is
  validated against `current.ts`. If migrations ran, the user is told that the file was upgraded
  and is offered a download of the original. The upgraded file is written on the next save.
- A file with a newer `schemaVersion` than the app supports is refused with a clear message. It is
  never rewritten.
- The fixture test migrates every fixture forward and validates it. Fixtures are generated by
  `pnpm gen:demo`, never written by hand, and are excluded from Prettier.

To change the schema:

1. Edit `current.ts`.
2. Add `migrations/vN-to-vN+1.ts` and list it in `migrations/index.ts`.
3. Bump `CURRENT_SCHEMA_VERSION`.
4. Generate `fixtures/vN+1.json` with `pnpm gen:demo --years 1 --seed 42 --end 2026-11-24 --out src/domain/schema/fixtures/vN+1.json`.
5. Update the demo generator, the commands and the merge (`sync/merge.ts`) if the change adds a
   collection.

Additive optional fields still need a version bump, so that an older app refuses the file instead
of silently dropping the field on save.

## 6. The in-memory model

`DocModel` (`domain/model.ts`) holds the same content as the file, but every collection is a map
keyed by id. This has two benefits:

- Commands address entities directly.
- Immer patch paths contain the entity id, which is what makes incremental index updates cheap.

**Transactions are bucketed.** They are stored as `transactions[bucket][id]`, where the bucket is
the first character of the id's random part (62 buckets). Immer copies a container when an entry
changes, so an edit copies about 1/62 of the transactions instead of all of them. Always use the
helpers: `getTransaction`, `putTransaction`, `removeTransaction`, `iterateTransactions` and
`countTransactions`.

Conversion between the file and the model happens in the codec (`persistence/codec/serialize.ts`),
which runs in the worker.

## 7. Commands, undo and redo

Every mutation is a **command** (`domain/commands/*.ts`) declared with `defineCommand` and
registered in `commands/index.ts`:

```ts
// Simplified from domain/commands/tags.ts
export const updateTag = defineCommand<{ id: Id; changes: { name?: string } }>({
  label: 'Edit tag',
  run(draft, { id, changes }, { now }) {
    const tag = required(draft.tags[id], 'Tag');
    if (changes.name !== undefined && !changes.name.trim())
      throw new CommandError('Tag name is required.');
    applyChanges(tag, changes);
    tag.updatedAt = now;
  },
});
```

- Commands are pure functions of `(draft, payload, ctx)`. `ctx` supplies `now` and `newId`, so
  tests are deterministic.
- An invalid command throws `CommandError`, and the document is left unchanged. UI code calls
  `tryDispatch` or `tryRun` (`store/actions.ts`), which turn errors into toasts. `toastWithUndo`
  adds an Undo button.
- `docStore.dispatch` runs the command with Immer's `produceWithPatches`. It pushes the inverse
  patches onto the undo stack and passes the forward patches to `DocIndex.applyPatches`.
- Commands keep invariants. For example, both sides of a transfer change together and split
  sums must match. Deleting a category moves its children up to its parent, reassigns its
  transactions, and retargets the budget lines that pointed at it.

## 8. Indexes and aggregates

`DocIndex` (`aggregates/docIndex.ts`) is built once on load in O(n log n) and then updated per
patch in O(log n):

| Index                         | Used for                                                           |
| ----------------------------- | ------------------------------------------------------------------ |
| `byDate`                      | Sorted `date\|rank\|id` keys for the register and date ranges      |
| `byAccount`                   | The same, per account                                              |
| `categoryByMonth`             | Rollup: month → category → summed split amounts (reports, budgets) |
| `accountDailyDelta`           | Per account, net change per day with prefix sums (balances)        |
| `unreconciled`, `byStatement` | Reconciliation candidates and statement contents                   |

Within a day, the register (newest first) lists the most recently entered transaction first,
then payee A–Z, then amount; `sortKey` encodes that order as a plain string.

The index is mutable for speed. It exposes version counters, and selectors and hooks recompute
when the version they depend on changes. Expensive derived data, such as effective splits and row
labels, is cached per immutable object in `WeakMap`s.

`pnpm bench` runs the hot paths against a synthetic 50k-transaction file and fails if a target is
missed. Run it when touching the indexes, the register, budgets or reports.

## 9. Transactions

```ts
{ id, accountId, date, payee, amount,   // amount is signed cents
  categoryId?, tags?, excluded?, note?,
  splits?,                              // ≥ 2 entries, summing to amount; no top-level categoryId
  reconciled?, statementId?,
  transfer?: { peerId },                // the linked transaction in the other account
  createdAt, updatedAt }
```

- **Splits are optional.** Most transactions have one `categoryId`. A split transaction has a
  `splits` array instead, and each split has its own amount, category, tags, excluded flag and
  note. Everything that aggregates reads through `effectiveSplits(t)` (`transactions/splits.ts`),
  which returns one pseudo-split for an unsplit transaction. As a result, no feature has to handle
  both shapes. Effective tags are the union of the transaction's tags and the split's tags.
- **Transfers** are two transactions, one in each account, with opposite amounts, linked by
  `transfer.peerId`. Commands create, edit and delete both sides together. Transfers count
  toward no budget and are neither income nor spending.
- **Excluded** transactions or splits, such as reimbursable expenses, still affect balances but
  count toward no budget or report total.
- **The filter language** (`transactions/filter.ts`) backs the register search: `acct:`, `cat:`,
  `tag:`, `payee:`, `note:`, `is:`, date ranges, amount comparisons, `budget:` and free text, with
  `-` to negate. `budget:` uses the same assignment engine as the budget screens (§11), so
  drilling down from a budget line shows exactly the transactions that line counts.

## 10. Balances and net worth

An account's balance is determined by **snapshots plus transactions** (`aggregates/balances.ts`):

- A snapshot says "the balance at the start of `date` is X".
- Between snapshots, the balance follows the transactions. The balance on any date is a binary
  search over the account's daily-delta prefix sums: O(log n).
- The **first snapshot** fixes the opening balance. Balances before it are derived backwards from
  it.
- When a later snapshot disagrees with what the previous snapshot plus the transactions imply,
  the difference is an **adjustment**. For investment and property accounts this is market change,
  which is how balance-only accounts work. For bank and card accounts it is an unexplained
  discrepancy, and the UI flags it.
- Net worth on a date is the sum of all account balances. Liabilities are negative.
- Charts sample balances at monthly or daily points (`aggregates/sampling.ts`). They never plot raw
  transactions.

## 11. Budgets

Budgets compare **spending** with **budgeted amounts**. Spending is the negative of the summed
split amounts, so refunds reduce spending. There are three kinds of budget, and one assignment
engine decides which budget each split counts toward.

### 11.1 Monthly and annual budgets: template and periods

- The **template** (`budgets.template.lines`) is the default budget. Each line has a `cadence`
  (`monthly` or `annual`), a `target`, a `defaultAmount` and a `rolloverPolicy`. A target is
  either a set of categories or `everythingElse`.
- A **period** is a concrete month (`YYYY-MM`) or budget year (`YYYY`). Creating a period copies
  the template lines and fixes each line's `base` (budgeted amount) and `rollover`. The
  **effective budget** of a line is `base + rollover`.
- Until a period is created, its view uses the template lines and is shown as _provisional_
  (italic). The user creates periods explicitly, typically at the start of each month or year.
- Annual periods follow the `budgetYearStartMonth` setting. With a July start, period `2026` runs
  from 2026-07-01 to 2027-06-30 (`budgets/periods.ts`).
- Editing the template doesn't change periods that already exist, so history stays stable.
- Template lines and period lines each have an optional `note`. Notes aren't copied when a period
  is created: a default line's note explains the default, a period line's note explains that
  period.
- Template, period and custom budget lines can also have a **plan** (`plan`, since v5): labeled
  amounts the line should cover, e.g. car and renters insurance in an Insurance line. A plan
  never changes the budgeted amount. The UI compares the two and shows an exact match, a buffer
  or a shortfall (`budgets/plan.ts`). Like notes, plans aren't copied into created periods.
- A created period can be edited on its own (Edit on the month or year view): amounts,
  rollovers, categories, names, notes and plans; lines can be removed, re-added from the
  defaults (`setPeriodLine`), or added just for that period (`addPeriodLine`, which gives the
  line its own id since no default backs it).

### 11.2 Rollover

When a period is created, `rolloverSuggestions` (`budgets/views.ts`) computes each line's
`remaining` amount (effective budget minus spent) in the previous period. The line's policy then
decides the rollover:

| Policy   | Behavior                                                                                                                                  |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `full`   | Carry the remaining amount forward: a surplus adds to the next period and an overspend subtracts from it.                                 |
| `prompt` | Suggest the remaining amount, and the user accepts or edits it in the create-period dialog. This applies to both over- and underspending. |
| `none`   | Start fresh at the base amount.                                                                                                           |

The rollover is stored on the period line, so later edits to old transactions don't silently
change a period that was already set up.

### 11.3 Custom budgets

A custom budget is a **tag-based** budget, typically for a trip, a project or an event:

- `match`: a set of tags, matched in `any` or `all` mode against a split's effective tags.
- `dateRange`: an optional start and end date.
- `lines`: category lines and an optional `everythingElse` line, each with an amount.
- `priority`: decides which custom budget wins when several match. Users set it by dragging
  budgets into order on the Custom tab (`reorderCustomBudgets`).

Spending that matches a custom budget counts **only** there and is removed from the monthly and
annual budgets. A trip's restaurant meals don't consume the monthly Food budget.

### 11.4 Assignment precedence

`createAssigner` (`budgets/assign.ts`) maps each effective split to at most one budget line:

1. **Nothing**: excluded splits, transfers and income categories.
2. **Custom budgets**, in priority order: the first one whose tags and date range match. Within
   it, the deepest matching category line, else its Everything Else line, else the budget's
   unallocated remainder.
3. **The most specific category line across monthly and annual**: walk from the split's
   category up through its ancestors, and take the first line that targets any of them. A line
   for `Food > Restaurants` beats a line for `Food`, even if they're in different tiers. If both
   tiers target the same category, the `tierOrder` setting breaks the tie.
4. **Everything Else**: the line in the tier preferred by the `everythingElseTier` setting, then
   the other tier. Uncategorized spending is included only if `uncategorizedToEverythingElse` is
   on.
5. **Unbudgeted**: anything else, so no spending silently disappears.

The engine uses the lines of the period that contains the transaction's date: the created period
if there is one, otherwise the template. `createBudgetResolver` caches one assigner per month, and
budget views aggregate over the `categoryByMonth` rollup wherever no tags are involved.

## 12. Statements and reconciliation

A statement (`statements/reconcile.ts`) has an account, a date range, opening and closing
balances, and a status of `open` or `reconciled`.

- When a statement is created, the app suggests the opening balance (the previous statement's
  closing balance) and the dates.
- Reconciling offers the account's unreconciled transactions in the period, plus
  `reconcileGraceDays` on either side for items that post late. Checking an item sets its
  `statementId`, so progress is saved while the statement is open.
- The difference shown is `closing − (opening + checked)`. Once it reaches zero, **Finish**
  marks the checked transactions `reconciled`. It can also record the closing balance as a
  snapshot (`source: 'statement'`) at the start of the day after the statement ends. A reconciled
  statement can be reopened.
- Transactions reconciled by hand, without a statement, are still offered within the window.

## 13. Reports

Reports (`reports/reports.ts`) are monthly. They read the `categoryByMonth` rollup and account
balances, never raw transactions: spending and income by category, income versus spending,
budget history and net worth change. Every chart has a table view. Colors follow the chart tokens
(see §16).

## 14. Planner

The planner (`planner/engine.ts`) projects take-home pay from user-editable rules. No country's
tax law is hard-coded in the engine. Templates (`planner/templates.ts`) supply starting rules,
and users can edit everything.

- **Tax years**: published figures (brackets, standard deductions, payroll rates and limits) live
  in `planner/taxYears/`, one file per year, listed in `taxYears/index.ts`. A scenario's template
  uses its year's figures, or the latest earlier year when that year isn't published yet. Adding a
  year is one new file; scenarios keep a copy of their rules, so existing ones don't change.
- **Updating a scenario's tax year** (`planner/taxYearUpdate.ts`): template rules carry a
  `template` tag (key, year, filing status). Untagged rules from older files are recognized by
  matching their figures against every published year, then by default name. A rule whose figures
  still equal its year's template is updated automatically; an edited rule is replaced only if the
  user ticks it, and rules not from the template are never touched.
- **Savings** (`savings`, yearly) is set aside from take-home pay and isn't counted as left over
  after the budget.
- **Disabled lines**: incomes, deductions and tax rules marked `disabled` (and savings with
  `savingsDisabled`) are kept but left out of the calculation, for trying "what if" without
  deleting anything. `computeScenario` filters them; a rule that subtracts a disabled tax treats
  it as zero.

- **Incomes** are typed `w2`, `1099` or `other`, and may belong to a **person** in the household.
- **Deductions** are pre-tax or post-tax, and list the bases they reduce (a 401(k) reduces taxable
  income, but not wages).
- **Bases**: `gross`, `wages` (W-2), `seEarnings` (1099) and `taxableIncome`.
- **Tax rules**: the base is multiplied by `baseFactor`, reduced by fractions of other taxes
  (`lessTaxes`) and by `deduction`, floored at zero, capped by `cap` (minus a `capReducedBy` base),
  and reduced by `threshold`. A `flat` rate or `brackets` schedule is then applied. Rules are
  evaluated in dependency order, and cycles are reported as errors.
- **`perPerson`** rules, such as Social Security, Medicare and self-employment tax, run on each
  person's own bases with their own cap and threshold, and are then summed. This is what makes
  two-earner households correct: each earner has their own Social Security wage base. Household
  rules, such as income tax and Additional Medicare for joint filers, run on the combined bases.

## 15. Persistence, sync and encryption

### Storage adapters

Adapters (`persistence/adapters/`) move opaque bytes. They know nothing about JSON, schemas or
encryption.

| Adapter     | Where                                                                                                          | Change detection                         |
| ----------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `fs-access` | A real file on disk (File System Access API, Chromium desktop). The handle is kept in IndexedDB for reopening. | `lastModified`                           |
| `download`  | Everywhere else: open with a file picker, save by downloading (or the share sheet on touch devices)            | Revision comparison on open              |
| `dropbox`   | The app's own Dropbox folder (OAuth PKCE in the browser, no server)                                            | Dropbox `rev`, and `update` mode uploads |

To add a backend, implement `StorageAdapter` (`persistence/types.ts`) and register it in
`adapters/index.ts`.

### Working copy

The open document is continuously written to IndexedDB (`persistence/workingCopy.ts`), together
with its source, base revision and dirty flag. On startup, the working copy is restored, and the
user is told if it holds unsaved edits. IndexedDB also holds the remembered file handles,
remembered encryption keys, and the **merge base**: the bytes last read from or written to
storage.

### Revisions, conflicts and merging

- `meta.revision` increments on every save. `savedBy` records a per-device id.
- Before overwriting, an adapter checks that the stored file is still the version that was last
  read (`lastModified` or `rev`). If it isn't, the save returns `changed` with the other version's
  bytes. If only the timestamp changed and the revision didn't, the save proceeds.
- The conflict dialog offers **Merge both** (recommended), Keep only mine, Save mine as a copy, or
  Use theirs.
- **Merging** (`domain/sync/merge.ts`) is a three-way merge of `base`, `local` and `remote`, per
  entity, by id:
  - An entity changed on one side only takes that side's version.
  - An entity changed on both sides keeps the local version, and the merge reports the item as a
    conflict.
  - An entity edited on one side and deleted on the other keeps the edit.
  - Settings merge field by field, and tombstones are unioned.
  - Afterwards, links broken by the other side's deletions are repaired: a transfer missing its
    peer, statements, categories and tags.
  - The merged document is saved on top of the remote revision, and the user sees a summary.
- On startup, and whenever the app comes back (visible again, focused, restored from the
  back/forward cache, or back online), it checks whether the file changed elsewhere; a failed
  check is retried once. If there are no local edits, it reloads silently. If there are, it
  offers the merge.
- Unsaved changes are tracked against the undo history: each step has a content id, and the
  document is clean when its current id is the one last saved. Undoing back to the saved state
  makes it clean again. Loads that already differ from the file (migrated, merged) and
  `markDirty` match no id, so they stay unsaved.

### Encryption

Encryption is opt-in per file (`persistence/codec/crypto.ts`). The encrypted file is a JSON
envelope:

```jsonc
{
  "format": "transact-encrypted",
  "envelopeVersion": 1,
  "fileId": "fil_…",
  "kdf": { "name": "PBKDF2", "hash": "SHA-256", "iterations": 600000, "salt": "…" },
  "cipher": { "name": "AES-GCM", "iv": "…" },
  "payload": "…base64…",
}
```

- The key is derived from the passphrase with PBKDF2. The salt is fixed per file and the IV is
  fresh on every save. The file id is bound as additional authenticated data.
- The working copy and the merge base are stored encrypted too. A device can remember the key as
  a **non-extractable** `CryptoKey` in IndexedDB. Otherwise the passphrase is asked for on open.
- The plaintext inside the envelope is a normal data file, so schema versioning is independent of
  encryption.
- A lost passphrase cannot be recovered. The UI says so before encryption is turned on.
- An encrypted file never becomes unencrypted without the user's say-so. If an unencrypted copy
  of the open encrypted file (same file id) is about to be loaded (a reload, an open, "Use
  theirs") or merged in, the user is asked first, and keeping the encrypted version is the
  default. Without this, anyone who can write the file (e.g. with access to the user's Dropbox)
  could swap in an unencrypted copy and have every later save written in the clear.
- Turning encryption on, changing the passphrase or turning it off rewrites the working copy and
  the merge base right away, so no local copy is left in the old form. Closing a file removes its
  merge base, and opening a file removes the bases of other files.

### Security headers

`public/_headers` sets the production headers (`pnpm preview` applies the same ones). The CSP
allows scripts from this origin only and network requests to this origin and Dropbox's API only.
It also requires **Trusted Types**: `innerHTML`, script URLs and other code-loading sinks accept
only values from the single `default` policy in `src/app/trustedTypes.ts`, imported first in
`main.tsx`. That policy rejects any HTML containing markup (Mantine's CSS text, which has none,
passes), all script strings, and script URLs from other origins. The Workbox runtime is inlined
into `sw.js` because `importScripts` is such a sink too.

Dropbox sign-in only completes a sign-in that this tab started (matching `state`), and never shows
text from the URL, so a crafted link can't put its words in the app. Disconnecting and Clear local
data revoke the token at Dropbox, refreshing it first if it has expired.

## 16. UI conventions

- **Routing**: hash-based (`#/path`), so the static build works on any host. Each screen is one
  entry in `app/routes.ts` plus a lazily loaded page component in `features/<name>/`.
- **Keyboard**: declare every command once in `keyboard/catalog.ts` (id, title and default keys),
  and attach handlers with `useCommandHandlers`. Shortcuts, the ⌘K palette, the `?` overlay and
  Settings → Keyboard all read the catalog, and users can rebind any command.
- **Settings**: declare options in `domain/settings/registry.ts` with `file` scope (shared by every
  device) or `device` scope (`store/prefsStore.ts`). The Settings screen renders them
  automatically.
- **Styling**: SCSS modules next to their component, one component per file. Use
  `@use '@/styles/tokens' as *;` for spacing, type and breakpoints, and `var(--tx-*)` for colors.
  Mantine provides complex controls and is themed compact in `app/theme.ts`.
- **Density**: rows are about 26px, base type is 13px, numbers are tabular, and chrome and
  explanatory text are kept to a minimum.
- **Charts**: use `--tx-chart-1` for a single series, and `--tx-series-1…8` in order for
  categories. Fold anything beyond eight into `--tx-series-other`. The palette was validated for
  contrast and color-vision differences in both themes. Every chart has a table view.
- **Heavy work** (parsing, migration, validation, serialization) runs in the I/O worker. zod and
  the codec stay out of the main bundle.

## 17. Recipes

**Add a field to an entity.** Follow the schema change steps in §5. Then update the commands that
create or edit the entity and the demo generator, and add tests.

**Add a command.** Write it in the relevant `domain/commands/*.ts` file, register it in
`commands/index.ts`, add a test in `store/commands.test.ts` (or a nearby test file), and call it
from the UI with `tryDispatch`.

**Add a screen.** Add a route in `app/routes.ts` and a page in `features/<name>/`. Add a
`go to` keyboard command in the catalog if it deserves one.

**Add a report.** Compute it in `domain/reports/` from the monthly rollups, test it, and render it
with the shared chart components and a table view.

**Before finishing any change.** Run `pnpm check`. Run `pnpm bench` if you touched anything on
the hot path. Never commit real financial data, and use `pnpm gen:demo` for samples.
