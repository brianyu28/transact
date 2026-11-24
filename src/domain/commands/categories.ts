import { original, type Draft } from 'immer';
import { getTransaction, iterateTransactions, type DocModel } from '../model';
import type { BudgetTarget, Category, CategoryKind, Id } from '../schema/types';
import { applyChanges, CommandError, defineCommand, required, tombstone } from './define';

function siblingsOf(draft: Draft<DocModel>, parentId: Id | null): Draft<Category>[] {
  return Object.values(draft.categories)
    .filter((c) => c.parentId === parentId)
    .sort((a, b) => a.order - b.order);
}

export const createCategory = defineCommand<
  { name: string; parentId: Id | null; kind?: CategoryKind },
  Id
>({
  label: 'Add category',
  run(draft, { name, parentId, kind }, { now, newId }) {
    if (parentId !== null) required(draft.categories[parentId], 'Parent category');
    const siblings = siblingsOf(draft, parentId);
    const category: Category = {
      id: newId('category'),
      name: name.trim(),
      parentId,
      order: Math.max(-1, ...siblings.map((c) => c.order)) + 1,
      updatedAt: now,
    };
    if (kind === 'income' && parentId === null) category.kind = kind;
    draft.categories[category.id] = category;
    return category.id;
  },
});

export const updateCategory = defineCommand<{
  id: Id;
  changes: { name?: string; kind?: CategoryKind; archived?: true | undefined };
}>({
  label: 'Edit category',
  run(draft, { id, changes }, { now }) {
    const category = required(draft.categories[id], 'Category');
    applyChanges(category, {
      ...(changes.name !== undefined ? { name: changes.name.trim() } : {}),
      ...('archived' in changes ? { archived: changes.archived } : {}),
      // Kind lives on top-level categories only; 'expense' is the default (omitted).
      ...(changes.kind !== undefined && category.parentId === null
        ? { kind: changes.kind === 'income' ? 'income' : undefined }
        : {}),
    });
    category.updatedAt = now;
  },
});

/** Sets the order of one parent's subcategories (null = top level) to the given id order. */
export const reorderCategories = defineCommand<{ parentId: Id | null; ids: readonly Id[] }>({
  label: 'Reorder categories',
  run(draft, { parentId, ids }, { now }) {
    const siblings = new Set(siblingsOf(draft, parentId).map((c) => c.id));
    if (ids.length !== siblings.size || ids.some((id) => !siblings.has(id))) {
      throw new CommandError('Categories can only be reordered among their siblings.');
    }
    ids.forEach((id, order) => {
      const category = draft.categories[id];
      if (category && category.order !== order) {
        category.order = order;
        category.updatedAt = now;
      }
    });
  },
});

/** Moves a category under a new parent (null = top level), placing it last. */
export const setCategoryParent = defineCommand<{ id: Id; parentId: Id | null }>({
  label: 'Move category',
  run(draft, { id, parentId }, { now }) {
    const category = required(draft.categories[id], 'Category');
    if (parentId !== null) {
      required(draft.categories[parentId], 'Parent category');
      // Walk up from the new parent; reaching `id` would create a cycle.
      for (
        let cursor: Id | null = parentId;
        cursor !== null;
        cursor = draft.categories[cursor]?.parentId ?? null
      ) {
        if (cursor === id) throw new CommandError('A category can’t be moved inside itself.');
      }
    }
    if (category.parentId === parentId) return;
    category.parentId = parentId;
    category.order =
      Math.max(
        -1,
        ...siblingsOf(draft, parentId)
          .filter((c) => c.id !== id)
          .map((c) => c.order),
      ) + 1;
    if (parentId !== null) Reflect.deleteProperty(category, 'kind');
    category.updatedAt = now;
  },
});

function retarget(target: Draft<BudgetTarget>, id: Id, replacement: Id | null): boolean {
  if (target.kind !== 'categories' || !target.categoryIds.includes(id)) return false;
  const next = target.categoryIds.filter((c) => c !== id);
  if (replacement !== null && !next.includes(replacement)) next.push(replacement);
  target.categoryIds = next;
  return true;
}

/**
 * Deletes a category. Its subcategories move up to its parent; transactions (and splits)
 * that used it are reassigned to `reassignTo` or left uncategorized; budget lines that
 * targeted it are retargeted (and removed if nothing is left).
 */
export const deleteCategory = defineCommand<{ id: Id; reassignTo: Id | null }>({
  label: 'Delete category',
  run(draft, { id, reassignTo }, { now }) {
    const category = required(draft.categories[id], 'Category');
    if (reassignTo === id) throw new CommandError('Choose a different category.');
    if (reassignTo !== null) required(draft.categories[reassignTo], 'Replacement category');

    for (const child of siblingsOf(draft, id)) {
      child.parentId = category.parentId;
      child.updatedAt = now;
    }

    const base: DocModel = original(draft);
    const affected: Id[] = [];
    for (const t of iterateTransactions(base)) {
      if (t.categoryId === id || t.splits?.some((s) => s.categoryId === id)) affected.push(t.id);
    }
    for (const txnId of affected) {
      const t = getTransaction(draft, txnId);
      if (!t) continue;
      if (t.categoryId === id) applyChanges(t, { categoryId: reassignTo ?? undefined });
      for (const s of t.splits ?? []) {
        if (s.categoryId === id) applyChanges(s, { categoryId: reassignTo ?? undefined });
      }
      t.updatedAt = now;
    }

    const lines = draft.budgets.template.lines;
    for (const line of Object.values(lines)) {
      if (
        retarget(line.target, id, reassignTo) &&
        line.target.kind === 'categories' &&
        line.target.categoryIds.length === 0
      ) {
        Reflect.deleteProperty(lines, line.id);
      }
    }
    for (const period of Object.values(draft.budgets.periods)) {
      for (const line of period.lines) retarget(line.target, id, reassignTo);
      period.lines = period.lines.filter(
        (l) => l.target.kind !== 'categories' || l.target.categoryIds.length > 0,
      );
    }
    for (const custom of Object.values(draft.budgets.custom)) {
      for (const line of custom.lines) retarget(line.target, id, reassignTo);
      custom.lines = custom.lines.filter(
        (l) => l.target.kind !== 'categories' || l.target.categoryIds.length > 0,
      );
    }

    Reflect.deleteProperty(draft.categories, id);
    tombstone(draft, id, now);
  },
});
