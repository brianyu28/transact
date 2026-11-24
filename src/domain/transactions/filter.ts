/**
 * The transaction filter language. A query is a list of space-separated terms:
 *
 *   acct:amex  account:"Everyday Checking"   (account name; prefix/substring match)
 *   cat:food   category:groceries            (includes subcategories)
 *   tag:trip-2026                            (transaction or split tags)
 *   payee:"corner grocer"   note:refund      (substring)
 *   is:reconciled | unreconciled | split | transfer | excluded | uncategorized | income | expense
 *   2026  2026-11  2026-11-24  2026-01..2026-03  2026-06..  ..2025-12
 *   date:this-month | last-month | this-year | last-year | last-30-days
 *   >50  <=100  =42.10  amount:20..80        (absolute amount)
 *   budget:food   budget:"Trip 2026"   budget:unbudgeted   (what a budget line counts)
 *   coffee                                   (free text: payee or note contains)
 *
 * Any term can be negated with a leading "-" (e.g. -tag:reimbursable). Terms are ANDed;
 * a name that matches several accounts/categories/tags matches any of them.
 */
import {
  addDays,
  addMonths,
  dateParts,
  endOfMonth,
  isISODate,
  startOfMonth,
  type ISODate,
} from '@/lib/date';
import { parseMoney, type Cents } from '@/lib/money';
import { categoryTree } from '../aggregates/lookups';
import { createBudgetResolver, lineLabel } from '../budgets/views';
import type { DocModel } from '../model';
import type { Id, Transaction } from '../schema/types';
import { effectiveSplits } from './splits';

export type TermKind =
  'account' | 'category' | 'tag' | 'payee' | 'note' | 'is' | 'date' | 'amount' | 'budget' | 'text';

export interface Term {
  raw: string;
  kind: TermKind;
  value: string;
  negated: boolean;
}

const KEYS: Record<string, TermKind> = {
  acct: 'account',
  account: 'account',
  cat: 'category',
  category: 'category',
  tag: 'tag',
  payee: 'payee',
  note: 'note',
  is: 'is',
  date: 'date',
  amount: 'amount',
  amt: 'amount',
  budget: 'budget',
};

const TERM_RE = /(-?)(?:([a-z]+):)?("([^"]*)"?|\S+)/gi;
const DATE_RE = /^(\d{4}(?:-\d{2}(?:-\d{2})?)?)?(\.\.)?(\d{4}(?:-\d{2}(?:-\d{2})?)?)?$/;
const AMOUNT_RE = /^(>=|<=|>|<|=)\s*(.+)$/;

export function parseQuery(query: string): Term[] {
  const terms: Term[] = [];
  for (const m of query.matchAll(TERM_RE)) {
    const [raw, neg, key, token = '', quoted] = m;
    const value = quoted ?? token;
    const negated = neg === '-';
    const keyKind = key ? KEYS[key.toLowerCase()] : undefined;
    if (key && !keyKind) {
      // Unknown "key:" — treat the whole thing as text.
      terms.push({ raw, kind: 'text', value: `${key}:${value}`, negated });
    } else if (keyKind) {
      terms.push({ raw, kind: keyKind, value, negated });
    } else if (!quoted && AMOUNT_RE.test(value)) {
      terms.push({ raw, kind: 'amount', value, negated });
    } else if (!quoted && /\d{4}/.test(value) && DATE_RE.test(value)) {
      terms.push({ raw, kind: 'date', value, negated });
    } else if (value) {
      terms.push({ raw, kind: 'text', value, negated });
    }
  }
  return terms;
}

export interface CompiledFilter {
  /** Matches a transaction (all terms ANDed). */
  test: (t: Transaction) => boolean;
  /** Narrowing hints for the index: only these accounts / this date range can match. */
  accountIds: ReadonlySet<Id> | null;
  dateRange: { from: ISODate; to: ISODate } | null;
  /** Terms that couldn't be understood, with a reason (shown to the user). */
  problems: { term: Term; message: string }[];
  terms: Term[];
}

type Pred = (t: Transaction) => boolean;

/** Resolves a name against a list: exact match, else prefix matches, else substring matches. */
function resolveNames<T extends { id: Id; name: string }>(items: readonly T[], query: string): T[] {
  const q = query.toLowerCase();
  const exact = items.filter((i) => i.name.toLowerCase() === q);
  if (exact.length) return exact;
  const prefix = items.filter((i) => i.name.toLowerCase().startsWith(q));
  if (prefix.length) return prefix;
  return items.filter((i) => i.name.toLowerCase().includes(q));
}

function parseDateTerm(value: string, today: ISODate): { from: ISODate; to: ISODate } | null {
  const { year } = dateParts(today);
  switch (value.toLowerCase()) {
    case 'today':
      return { from: today, to: today };
    case 'this-month':
      return { from: startOfMonth(today), to: endOfMonth(today) };
    case 'last-month': {
      const d = addMonths(startOfMonth(today), -1);
      return { from: d, to: endOfMonth(d) };
    }
    case 'this-year':
      return { from: `${year}-01-01`, to: `${year}-12-31` };
    case 'last-year':
      return { from: `${year - 1}-01-01`, to: `${year - 1}-12-31` };
  }
  const lastN = /^last-(\d+)-days?$/i.exec(value);
  if (lastN) return { from: addDays(today, -Number(lastN[1]) + 1), to: today };

  const m = DATE_RE.exec(value);
  if (!m) return null;
  const [, a, dots, b] = m;
  const start = (s: string) => (s.length === 4 ? `${s}-01-01` : s.length === 7 ? `${s}-01` : s);
  const end = (s: string) =>
    s.length === 4 ? `${s}-12-31` : s.length === 7 ? endOfMonth(`${s}-01`) : s;
  if (!dots) return a ? { from: start(a), to: end(a) } : null;
  const from = a ? start(a) : '0000-01-01';
  const to = b ? end(b) : '9999-12-31';
  if ((a && !isISODate(from)) || (b && !isISODate(to))) return null;
  return { from, to };
}

function parseAmountTerm(value: string): ((abs: Cents) => boolean) | null {
  const range = /^(.+)\.\.(.+)$/.exec(value);
  if (range) {
    const lo = parseMoney(range[1] ?? '');
    const hi = parseMoney(range[2] ?? '');
    return lo === null || hi === null ? null : (abs) => abs >= lo && abs <= hi;
  }
  const m = AMOUNT_RE.exec(value);
  const op = m ? m[1] : '=';
  const cents = parseMoney(m ? (m[2] ?? '') : value);
  if (cents === null) return null;
  const n = Math.abs(cents);
  switch (op) {
    case '>':
      return (abs) => abs > n;
    case '>=':
      return (abs) => abs >= n;
    case '<':
      return (abs) => abs < n;
    case '<=':
      return (abs) => abs <= n;
    default:
      return (abs) => abs === n;
  }
}

const IS: Record<string, Pred> = {
  reconciled: (t) => t.reconciled === true,
  unreconciled: (t) => t.reconciled !== true,
  split: (t) => t.splits !== undefined,
  transfer: (t) => t.transfer !== undefined,
  excluded: (t) => effectiveSplits(t).some((s) => s.excluded),
  uncategorized: (t) => !t.transfer && effectiveSplits(t).some((s) => !s.categoryId && !s.excluded),
  income: (t) => t.amount > 0 && !t.transfer,
  expense: (t) => t.amount < 0 && !t.transfer,
};

export function compileFilter(
  query: string,
  doc: Pick<DocModel, 'accounts' | 'categories' | 'tags'> &
    Partial<Pick<DocModel, 'budgets' | 'settings' | 'transactions'>>,
  today: ISODate,
): CompiledFilter {
  const terms = parseQuery(query);
  const preds: Pred[] = [];
  const problems: CompiledFilter['problems'] = [];
  // Widened explicitly: TypeScript would otherwise narrow these to `null` inside the loop.
  let accountIds = null as Set<Id> | null;
  let dateRange = null as { from: ISODate; to: ISODate } | null;

  for (const term of terms) {
    let pred: Pred | null = null;
    const v = term.value;
    switch (term.kind) {
      case 'account': {
        const ids = new Set(resolveNames(Object.values(doc.accounts), v).map((a) => a.id));
        if (ids.size === 0) break;
        pred = (t) => ids.has(t.accountId);
        if (!term.negated)
          accountIds = accountIds ? new Set([...accountIds].filter((id) => ids.has(id))) : ids;
        break;
      }
      case 'category': {
        const tree = categoryTree(doc.categories);
        const ids = new Set(
          resolveNames(Object.values(doc.categories), v).flatMap(
            (c) => tree.byId.get(c.id)?.subtree ?? [c.id],
          ),
        );
        if (ids.size === 0) break;
        pred = (t) =>
          effectiveSplits(t).some((s) => s.categoryId !== undefined && ids.has(s.categoryId));
        break;
      }
      case 'tag': {
        const ids = new Set(resolveNames(Object.values(doc.tags), v).map((x) => x.id));
        if (ids.size === 0) break;
        pred = (t) => effectiveSplits(t).some((s) => s.tags.some((tag) => ids.has(tag)));
        break;
      }
      case 'payee': {
        const q = v.toLowerCase();
        pred = (t) => t.payee.toLowerCase().includes(q);
        break;
      }
      case 'note': {
        const q = v.toLowerCase();
        pred = (t) =>
          (t.note?.toLowerCase().includes(q) ?? false) ||
          (t.splits?.some((s) => s.note?.toLowerCase().includes(q)) ?? false);
        break;
      }
      case 'is':
        pred = IS[v.toLowerCase()] ?? null;
        break;
      case 'date': {
        const range = parseDateTerm(v, today);
        if (!range) break;
        pred = (t) => t.date >= range.from && t.date <= range.to;
        if (!term.negated) {
          dateRange = dateRange
            ? {
                from: range.from > dateRange.from ? range.from : dateRange.from,
                to: range.to < dateRange.to ? range.to : dateRange.to,
              }
            : range;
        }
        break;
      }
      case 'amount': {
        const test = parseAmountTerm(v);
        if (test) pred = (t) => test(Math.abs(t.amount));
        break;
      }
      case 'budget': {
        const { budgets, settings, transactions } = doc;
        if (!budgets || !settings || !transactions) break;
        const budgetDoc = { budgets, settings, transactions, categories: doc.categories };
        const resolve = createBudgetResolver(budgetDoc);
        if (['unbudgeted', 'none'].includes(v.toLowerCase())) {
          pred = (t) => resolve(t).some((r) => r.kind === 'unbudgeted');
          break;
        }
        // Budget lines (by their defaults id, shared by every period) and custom budgets.
        const named = new Map<Id, string>();
        for (const l of Object.values(budgets.template.lines))
          named.set(l.id, lineLabel(budgetDoc, l));
        for (const p of Object.values(budgets.periods)) {
          for (const l of p.lines)
            if (!named.has(l.templateLineId)) named.set(l.templateLineId, lineLabel(budgetDoc, l));
        }
        const lineIds = new Set(
          resolveNames(
            [...named].map(([id, name]) => ({ id, name })),
            v,
          ).map((x) => x.id),
        );
        const customIds = new Set(resolveNames(Object.values(budgets.custom), v).map((b) => b.id));
        if (lineIds.size === 0 && customIds.size === 0) break;
        pred = (t) =>
          resolve(t).some(
            (r) =>
              (r.kind === 'line' && lineIds.has(r.lineId)) ||
              (r.kind === 'custom' && customIds.has(r.budgetId)),
          );
        break;
      }
      case 'text': {
        const q = v.toLowerCase();
        pred = (t) =>
          t.payee.toLowerCase().includes(q) || (t.note?.toLowerCase().includes(q) ?? false);
        break;
      }
    }
    if (!pred) {
      problems.push({
        term,
        message: term.kind === 'is' ? `Unknown “is:${v}”` : `No ${term.kind} matches “${v}”`,
      });
      // An unresolvable positive term matches nothing (rather than silently being ignored).
      if (!term.negated) preds.push(() => false);
      continue;
    }
    const p = pred;
    preds.push(term.negated ? (t) => !p(t) : p);
  }

  return {
    test: (t) => preds.every((p) => p(t)),
    accountIds,
    dateRange,
    problems,
    terms,
  };
}
