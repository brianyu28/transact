/**
 * Performance benchmarks against a synthetic ~50k-transaction file (about 10 years of
 * heavy use). Run with `pnpm bench`; exits non-zero if a target is missed.
 */
import { firstDataDate, netWorthSeries } from '../src/domain/aggregates/balances';
import { DocIndex } from '../src/domain/aggregates/docIndex';
import { presetRange, sampleDates } from '../src/domain/aggregates/sampling';
import { budgetView, customBudgetViews } from '../src/domain/budgets/views';
import { reconcileCandidates } from '../src/domain/statements/reconcile';
import { generateDemoDocument } from '../src/domain/demo/generate';
import { iterateTransactions } from '../src/domain/model';
import { parseDocument } from '../src/domain/schema/document';
import { compileFilter } from '../src/domain/transactions/filter';
import { runFilter } from '../src/domain/transactions/query';
import { serializeModel } from '../src/persistence/codec/serialize';
import { createDocStore } from '../src/store/docStore';

interface Case {
  name: string;
  /** Target for the median run, in milliseconds. */
  targetMs: number;
  runs: number;
  fn: () => void;
}

function measure({ fn, runs }: Case): number {
  fn(); // warm-up
  const times: number[] = [];
  for (let i = 0; i < runs; i++) {
    const start = performance.now();
    fn();
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  return times[Math.floor(times.length / 2)] ?? 0;
}

const doc = generateDemoDocument({
  endDate: '2026-11-24',
  years: 10,
  scale: 10,
  appVersion: 'bench',
});
const text = serializeModel(doc);
const ids = [...iterateTransactions(doc)].map((t) => t.id);
const store = createDocStore();
store.getState().load(doc);
const index = DocIndex.build(doc);
let edit = 0;

const cases: Case[] = [
  {
    name: 'Parse + migrate + validate',
    targetMs: 500,
    runs: 5,
    fn: () => void parseDocument(text),
  },
  { name: 'Serialize', targetMs: 300, runs: 5, fn: () => void serializeModel(doc) },
  { name: 'Build index', targetMs: 150, runs: 5, fn: () => void DocIndex.build(doc) },
  {
    name: 'Edit one transaction (command, undo, index)',
    targetMs: 5,
    runs: 200,
    fn: () => {
      const id = ids[edit++ % ids.length] as string;
      store.getState().dispatch('updateTransaction', {
        id,
        changes: { date: edit % 2 ? '2020-01-01' : '2024-06-15' },
      });
    },
  },
  {
    name: 'Filter all: "cat:food >20 -tag:reimbursable"',
    targetMs: 50,
    runs: 20,
    fn: () =>
      void runFilter(
        doc,
        index,
        compileFilter('cat:food >20 -tag:reimbursable', doc, '2026-11-24'),
      ),
  },
  {
    name: 'Filter one account + month',
    targetMs: 16,
    runs: 50,
    fn: () => void runFilter(doc, index, compileFilter('acct:rewards 2024-03', doc, '2026-11-24')),
  },
  {
    name: 'Net worth, all time monthly (cached ledgers)',
    targetMs: 16,
    runs: 50,
    fn: () =>
      void netWorthSeries(
        doc,
        index,
        sampleDates(presetRange('all', '2026-11-24'), '2026-11-24', firstDataDate(doc, index)),
      ),
  },
  {
    name: 'Net worth, 3 months daily (cached ledgers)',
    targetMs: 16,
    runs: 50,
    fn: () =>
      void netWorthSeries(
        doc,
        index,
        sampleDates(presetRange('3m', '2026-11-24'), '2026-11-24', firstDataDate(doc, index)),
      ),
  },
  {
    name: 'Budget view: one month',
    targetMs: 16,
    runs: 50,
    fn: () => void budgetView(doc, index, 'monthly', '2026-10', '2026-11-24'),
  },
  {
    name: 'Budget view: one year (annual lines)',
    targetMs: 50,
    runs: 20,
    fn: () => void budgetView(doc, index, 'annual', '2026', '2026-11-24'),
  },
  {
    name: 'Custom budgets (all time)',
    targetMs: 100,
    runs: 10,
    fn: () => void customBudgetViews(doc, index, '2026-11-24'),
  },
  {
    name: 'Reconcile candidates (busiest account, one month)',
    targetMs: 16,
    runs: 50,
    fn: () => {
      const busiest =
        [...index.byAccount.entries()].sort((a, b) => b[1].length - a[1].length)[0]?.[0] ?? '';
      reconcileCandidates(
        doc,
        index,
        {
          id: 'stm_bench0000000',
          accountId: busiest,
          startDate: '2026-10-01',
          endDate: '2026-10-31',
          openingBalance: 0,
          closingBalance: 0,
          status: 'open',
          updatedAt: '2026-11-24T00:00:00.000Z',
        },
        7,
      );
    },
  },
  {
    name: 'Query one month (all accounts)',
    targetMs: 16,
    runs: 200,
    fn: () => void index.idsInRange('2024-03-01', '2024-03-31'),
  },
];

console.log(
  `${ids.length.toLocaleString()} transactions, ${(text.length / 1024 / 1024).toFixed(1)} MiB\n`,
);
let failed = 0;
for (const c of cases) {
  const ms = measure(c);
  const ok = ms <= c.targetMs;
  if (!ok) failed++;
  console.log(
    `${ok ? '✓' : '✗'} ${c.name.padEnd(46)} ${ms.toFixed(2).padStart(9)} ms  (target ${c.targetMs} ms)`,
  );
}
process.exit(failed > 0 ? 1 : 0);
