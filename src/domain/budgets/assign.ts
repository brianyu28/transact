/**
 * Decides which budget (if any) each split counts against. Precedence:
 *
 *   1. Excluded splits, transfers and income categories count against nothing.
 *   2. Custom budgets (matched by tags and date range), in priority order; within one,
 *      the most specific category line, else its "Everything Else" line, else unallocated.
 *   3. Monthly and annual lines whose categories include the split's category or an
 *      ancestor: the DEEPEST match wins across both tiers; ties go by the tier order setting.
 *   4. "Everything Else" (the preferred tier first), for categorized spending and,
 *      if enabled, uncategorized spending.
 *   5. Otherwise "Unbudgeted", so no spending silently disappears.
 *
 * Lines come from the created period when it exists, else from the defaults (template).
 */
import type { CategoryTree } from '../aggregates/lookups';
import type {
  BudgetTarget,
  BudgetTier,
  CustomBudget,
  FileSettings,
  Id,
  ISODate,
} from '../schema/types';
import type { EffectiveSplit } from '../transactions/splits';

export type BudgetRef =
  | { kind: 'line'; cadence: BudgetTier; lineId: Id }
  | { kind: 'custom'; budgetId: Id; lineId: Id | null }
  | { kind: 'unbudgeted' };

/** A budget line as the engine sees it (from a period or the template). */
export interface LineSpec {
  lineId: Id;
  target: BudgetTarget;
}

/** Lines in effect for one monthly and one annual period. */
export interface TierLines {
  monthly: readonly LineSpec[];
  annual: readonly LineSpec[];
}

interface TierIndex {
  /** categoryId → line targeting it (first line wins if two target the same category). */
  byCategory: Map<Id, Id>;
  everythingElse: Id | undefined;
}

function indexLines(lines: readonly LineSpec[]): TierIndex {
  const byCategory = new Map<Id, Id>();
  let everythingElse: Id | undefined;
  for (const line of lines) {
    if (line.target.kind === 'everythingElse') everythingElse ??= line.lineId;
    else
      for (const c of line.target.categoryIds)
        if (!byCategory.has(c)) byCategory.set(c, line.lineId);
  }
  return { byCategory, everythingElse };
}

export interface Assigner {
  assign(split: EffectiveSplit, date: ISODate): BudgetRef | null;
}

export function createAssigner(options: {
  tree: CategoryTree;
  settings: FileSettings['budget'];
  lines: TierLines;
  custom: readonly CustomBudget[];
}): Assigner {
  const { tree, settings } = options;
  const tiers: Record<BudgetTier, TierIndex> = {
    monthly: indexLines(options.lines.monthly),
    annual: indexLines(options.lines.annual),
  };
  const [firstTier, secondTier] = settings.tierOrder;
  const eeOrder: BudgetTier[] =
    settings.everythingElseTier === 'monthly' ? ['monthly', 'annual'] : ['annual', 'monthly'];

  const customs = options.custom
    .filter((b) => !b.archived)
    .sort((a, b) => a.priority - b.priority)
    .map((b) => ({
      budget: b,
      tags: new Set(b.match.tags),
      lines: indexLines(b.lines.map((l) => ({ lineId: l.id, target: l.target }))),
    }));

  /** Ancestor chain from the category itself up to the root. */
  const chain = (categoryId: Id): Id[] => {
    const out: Id[] = [];
    let node = tree.byId.get(categoryId);
    while (node) {
      out.push(node.category.id);
      node = node.category.parentId ? tree.byId.get(node.category.parentId) : undefined;
    }
    return out;
  };

  const deepest = (index: TierIndex, categoryId: Id | undefined): Id | undefined => {
    if (!categoryId) return undefined;
    for (const id of chain(categoryId)) {
      const line = index.byCategory.get(id);
      if (line) return line;
    }
    return undefined;
  };

  return {
    assign(split, date) {
      if (split.excluded) return null;
      const node = split.categoryId ? tree.byId.get(split.categoryId) : undefined;
      if (node?.kind === 'income') return null;

      // 2. Custom budgets.
      for (const c of customs) {
        const { start, end } = c.budget.dateRange ?? {};
        if ((start && date < start) || (end && date > end)) continue;
        const matched =
          c.budget.match.mode === 'all'
            ? [...c.tags].every((t) => split.tags.includes(t))
            : split.tags.some((t) => c.tags.has(t));
        if (!matched) continue;
        return {
          kind: 'custom',
          budgetId: c.budget.id,
          lineId: deepest(c.lines, split.categoryId) ?? c.lines.everythingElse ?? null,
        };
      }

      // 3. Most specific category line across both tiers.
      if (split.categoryId) {
        for (const id of chain(split.categoryId)) {
          for (const tier of [firstTier, secondTier]) {
            const line = tiers[tier].byCategory.get(id);
            if (line) return { kind: 'line', cadence: tier, lineId: line };
          }
        }
      }

      // 4. Everything Else.
      if (split.categoryId || settings.uncategorizedToEverythingElse) {
        for (const tier of eeOrder) {
          const line = tiers[tier].everythingElse;
          if (line) return { kind: 'line', cadence: tier, lineId: line };
        }
      }
      return { kind: 'unbudgeted' };
    },
  };
}
