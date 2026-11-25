/** Commands for the budget template (defaults), budget periods and custom budgets. */
import type { Draft } from 'immer';
import { normalizePlan } from '../budgets/plan';
import type { DocModel } from '../model';
import type {
  BudgetPeriod,
  BudgetTarget,
  BudgetTier,
  Cents,
  CustomBudget,
  Id,
  ISODate,
  PlanItem,
  RolloverPolicy,
  TemplateLine,
} from '../schema/types';
import {
  applyChanges,
  CommandError,
  defineCommand,
  required,
  tombstone,
  type CommandContext,
} from './define';

function validateTarget(draft: Draft<DocModel>, target: BudgetTarget) {
  if (target.kind === 'categories') {
    if (target.categoryIds.length === 0) throw new CommandError('Choose at least one category.');
    for (const id of target.categoryIds) required(draft.categories[id], 'Category');
  }
}

/** Plain copy of a target (works on Immer drafts, unlike structuredClone). */
function copyTarget(target: BudgetTarget): BudgetTarget {
  return target.kind === 'categories'
    ? { kind: 'categories', categoryIds: [...target.categoryIds] }
    : { kind: 'everythingElse' };
}

// ── Template (defaults) ──────────────────────────────────────────────────────

export const createTemplateLine = defineCommand<
  {
    cadence: BudgetTier;
    target: BudgetTarget;
    defaultAmount: Cents;
    name?: string;
    rolloverPolicy?: RolloverPolicy;
  },
  Id
>({
  label: 'Add budget line',
  run(draft, input, { now, newId }) {
    validateTarget(draft, input.target);
    const siblings = Object.values(draft.budgets.template.lines).filter(
      (l) => l.cadence === input.cadence,
    );
    if (
      input.target.kind === 'everythingElse' &&
      siblings.some((l) => l.target.kind === 'everythingElse')
    ) {
      throw new CommandError(`There is already an “Everything Else” ${input.cadence} line.`);
    }
    const line: TemplateLine = {
      id: newId('budgetLine'),
      cadence: input.cadence,
      target: input.target,
      defaultAmount: input.defaultAmount,
      rolloverPolicy: input.rolloverPolicy ?? draft.settings.budget.defaultRolloverPolicy,
      order: Math.max(-1, ...siblings.map((l) => l.order)) + 1,
    };
    applyChanges(line, { name: input.name?.trim() || undefined });
    draft.budgets.template.lines[line.id] = line;
    draft.budgets.template.updatedAt = now;
    return line.id;
  },
});

export const updateTemplateLine = defineCommand<{
  id: Id;
  changes: {
    target?: BudgetTarget;
    defaultAmount?: Cents;
    name?: string;
    rolloverPolicy?: RolloverPolicy;
    note?: string;
    plan?: readonly PlanItem[];
  };
}>({
  label: 'Edit budget line',
  run(draft, { id, changes }, { now }) {
    const line = required(draft.budgets.template.lines[id], 'Budget line');
    if (changes.target) validateTarget(draft, changes.target);
    applyChanges(line, {
      ...(changes.target ? { target: changes.target } : {}),
      ...(changes.defaultAmount !== undefined ? { defaultAmount: changes.defaultAmount } : {}),
      ...(changes.rolloverPolicy ? { rolloverPolicy: changes.rolloverPolicy } : {}),
      ...(changes.name !== undefined ? { name: changes.name.trim() || undefined } : {}),
      ...(changes.note !== undefined ? { note: changes.note.trim() || undefined } : {}),
      ...(changes.plan !== undefined ? { plan: normalizePlan(changes.plan) } : {}),
    });
    draft.budgets.template.updatedAt = now;
  },
});

export const reorderTemplateLines = defineCommand<{ ids: readonly Id[] }>({
  label: 'Reorder budget lines',
  run(draft, { ids }, { now }) {
    ids.forEach((id, order) => {
      required(draft.budgets.template.lines[id], 'Budget line').order = order;
    });
    draft.budgets.template.updatedAt = now;
  },
});

/** Removes a line from the defaults. Created periods keep their own copy of it. */
export const deleteTemplateLine = defineCommand<{ id: Id }>({
  label: 'Delete budget line',
  run(draft, { id }, { now }) {
    required(draft.budgets.template.lines[id], 'Budget line');
    Reflect.deleteProperty(draft.budgets.template.lines, id);
    draft.budgets.template.updatedAt = now;
    tombstone(draft, id, now);
  },
});

// ── Periods ──────────────────────────────────────────────────────────────────

export interface PeriodLineInput {
  templateLineId: Id;
  base: Cents;
  rollover: Cents;
}

/**
 * Creates a month or year budget from the defaults, with the chosen amounts and rollovers.
 * Notes and plans on default lines stay with the defaults; a period's lines start without.
 */
export const createPeriod = defineCommand<
  { cadence: BudgetTier; period: string; lines: readonly PeriodLineInput[] },
  Id
>({
  label: 'Create budget',
  run(draft, { cadence, period, lines }, { now, newId }) {
    if (
      Object.values(draft.budgets.periods).some((p) => p.cadence === cadence && p.period === period)
    ) {
      throw new CommandError('A budget for this period already exists.');
    }
    const created: BudgetPeriod = {
      id: newId('budgetPeriod'),
      cadence,
      period,
      lines: lines.map((input) => {
        const t = required(draft.budgets.template.lines[input.templateLineId], 'Budget line');
        if (t.cadence !== cadence)
          throw new CommandError('Budget line belongs to a different cadence.');
        const line: BudgetPeriod['lines'][number] = {
          templateLineId: t.id,
          target: copyTarget(t.target),
          base: input.base,
          rollover: input.rollover,
        };
        applyChanges(line, { name: t.name });
        return line;
      }),
      createdAt: now,
      updatedAt: now,
    };
    draft.budgets.periods[created.id] = created;
    return created.id;
  },
});

/**
 * Changes a line in a created period, adding it from the defaults if missing. Changing its
 * categories or name affects only this period.
 */
export const setPeriodLine = defineCommand<{
  periodId: Id;
  templateLineId: Id;
  changes: {
    base?: Cents;
    rollover?: Cents;
    note?: string;
    plan?: readonly PlanItem[];
    target?: BudgetTarget;
    name?: string;
  };
}>({
  label: 'Edit budget',
  run(draft, { periodId, templateLineId, changes }, { now }) {
    const period = required(draft.budgets.periods[periodId], 'Budget');
    if (changes.target) {
      validateTarget(draft, changes.target);
      if (changes.target.kind === 'everythingElse')
        throw new CommandError('Add “Everything Else” as its own line.');
    }
    let line = period.lines.find((l) => l.templateLineId === templateLineId);
    if (!line) {
      const t = required(draft.budgets.template.lines[templateLineId], 'Budget line');
      line = {
        templateLineId,
        target: copyTarget(t.target),
        base: t.defaultAmount,
        rollover: 0,
      };
      applyChanges(line, { name: t.name });
      period.lines.push(line);
      line = period.lines.at(-1);
    }
    if (!line) return;
    if (changes.base !== undefined) line.base = changes.base;
    if (changes.rollover !== undefined) line.rollover = changes.rollover;
    if (changes.note !== undefined) applyChanges(line, { note: changes.note.trim() || undefined });
    if (changes.plan !== undefined) applyChanges(line, { plan: normalizePlan(changes.plan) });
    if (changes.target && line.target.kind === 'categories') line.target = changes.target;
    if (changes.name !== undefined) applyChanges(line, { name: changes.name.trim() || undefined });
    period.updatedAt = now;
  },
});

/**
 * Adds a line to one created period only (the defaults are unchanged), e.g. a one-off
 * expense this month. It gets its own line id, since no default line backs it.
 */
export const addPeriodLine = defineCommand<
  { periodId: Id; target: BudgetTarget; base: Cents; name?: string },
  Id
>({
  label: 'Add budget line',
  run(draft, { periodId, target, base, name }, { now, newId }) {
    const period = required(draft.budgets.periods[periodId], 'Budget');
    validateTarget(draft, target);
    if (
      target.kind === 'everythingElse' &&
      period.lines.some((l) => l.target.kind === 'everythingElse')
    ) {
      throw new CommandError('This budget already has an “Everything Else” line.');
    }
    const line: BudgetPeriod['lines'][number] = {
      templateLineId: newId('budgetLine'),
      target: copyTarget(target),
      base,
      rollover: 0,
    };
    applyChanges(line, { name: name?.trim() || undefined });
    period.lines.push(line);
    period.updatedAt = now;
    return line.templateLineId;
  },
});

export const removePeriodLine = defineCommand<{ periodId: Id; templateLineId: Id }>({
  label: 'Remove budget line',
  run(draft, { periodId, templateLineId }, { now }) {
    const period = required(draft.budgets.periods[periodId], 'Budget');
    period.lines = period.lines.filter((l) => l.templateLineId !== templateLineId);
    period.updatedAt = now;
  },
});

export const deletePeriod = defineCommand<{ id: Id }>({
  label: 'Delete budget',
  run(draft, { id }, { now }) {
    required(draft.budgets.periods[id], 'Budget');
    Reflect.deleteProperty(draft.budgets.periods, id);
    tombstone(draft, id, now);
  },
});

// ── Custom budgets ───────────────────────────────────────────────────────────

export interface CustomBudgetInput {
  name: string;
  /** Tag names; missing tags are created. */
  tagNames: readonly string[];
  mode: 'any' | 'all';
  dateRange: { start?: ISODate; end?: ISODate } | null;
  lines: readonly {
    id?: Id;
    name: string;
    target: BudgetTarget;
    amount: Cents;
    plan?: readonly PlanItem[];
  }[];
}

function resolveTags(draft: Draft<DocModel>, names: readonly string[], ctx: CommandContext): Id[] {
  const byName = new Map(Object.values(draft.tags).map((t) => [t.name.toLowerCase(), t.id]));
  const ids: Id[] = [];
  for (const raw of names) {
    const name = raw.trim();
    if (!name) continue;
    let id = byName.get(name.toLowerCase());
    if (!id) {
      id = ctx.newId('tag');
      draft.tags[id] = { id, name, updatedAt: ctx.now };
      byName.set(name.toLowerCase(), id);
    }
    if (!ids.includes(id)) ids.push(id);
  }
  return ids;
}

function buildCustom(
  draft: Draft<DocModel>,
  input: CustomBudgetInput,
  ctx: CommandContext,
): Omit<CustomBudget, 'id' | 'priority' | 'updatedAt'> {
  if (!input.name.trim()) throw new CommandError('Give the budget a name.');
  const tags = resolveTags(draft, input.tagNames, ctx);
  if (tags.length === 0)
    throw new CommandError(
      'Choose at least one tag; transactions with it count toward this budget.',
    );
  for (const l of input.lines) validateTarget(draft, l.target);
  const { start, end } = input.dateRange ?? {};
  if (start && end && end < start) throw new CommandError('The end date is before the start date.');
  const budget: Omit<CustomBudget, 'id' | 'priority' | 'updatedAt'> = {
    name: input.name.trim(),
    match: { tags, mode: input.mode },
    lines: input.lines.map((l) => {
      const line: CustomBudget['lines'][number] = {
        id: l.id ?? ctx.newId('budgetLine'),
        name: l.name.trim(),
        target: l.target,
        amount: l.amount,
      };
      applyChanges(line, { plan: normalizePlan(l.plan ?? []) });
      return line;
    }),
  };
  if (start || end) budget.dateRange = { ...(start ? { start } : {}), ...(end ? { end } : {}) };
  return budget;
}

export const createCustomBudget = defineCommand<CustomBudgetInput, Id>({
  label: 'Add custom budget',
  run(draft, input, ctx) {
    const priority =
      Math.max(-1, ...Object.values(draft.budgets.custom).map((b) => b.priority)) + 1;
    const budget: CustomBudget = {
      id: ctx.newId('customBudget'),
      priority,
      updatedAt: ctx.now,
      ...buildCustom(draft, input, ctx),
    };
    draft.budgets.custom[budget.id] = budget;
    return budget.id;
  },
});

export const updateCustomBudget = defineCommand<{ id: Id; input: CustomBudgetInput }>({
  label: 'Edit custom budget',
  run(draft, { id, input }, ctx) {
    const existing = required(draft.budgets.custom[id], 'Custom budget');
    const next: CustomBudget = {
      id,
      priority: existing.priority,
      updatedAt: ctx.now,
      ...buildCustom(draft, input, ctx),
    };
    if (existing.archived) next.archived = true;
    draft.budgets.custom[id] = next;
  },
});

/**
 * Sets custom budget priority (the order they claim tagged spending and are listed in).
 * `ids` lists every custom budget, highest priority first.
 */
export const reorderCustomBudgets = defineCommand<{ ids: readonly Id[] }>({
  label: 'Reorder custom budgets',
  run(draft, { ids }, { now }) {
    ids.forEach((id, priority) => {
      const budget = required(draft.budgets.custom[id], 'Custom budget');
      if (budget.priority === priority) return;
      budget.priority = priority;
      budget.updatedAt = now;
    });
  },
});

export const setCustomBudgetArchived = defineCommand<{ id: Id; archived: boolean }>({
  label: 'Archive custom budget',
  run(draft, { id, archived }, { now }) {
    const budget = required(draft.budgets.custom[id], 'Custom budget');
    applyChanges(budget, { archived: archived ? true : undefined });
    budget.updatedAt = now;
  },
});

export const deleteCustomBudget = defineCommand<{ id: Id }>({
  label: 'Delete custom budget',
  run(draft, { id }, { now }) {
    required(draft.budgets.custom[id], 'Custom budget');
    Reflect.deleteProperty(draft.budgets.custom, id);
    tombstone(draft, id, now);
  },
});
