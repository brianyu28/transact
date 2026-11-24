import { original } from 'immer';
import { getTransaction, iterateTransactions, type DocModel } from '../model';
import type { Id, Tag } from '../schema/types';
import { applyChanges, CommandError, defineCommand, required, tombstone } from './define';

function assertUniqueName(tags: Record<Id, Tag>, name: string, exceptId?: Id) {
  const lower = name.toLowerCase();
  if (Object.values(tags).some((t) => t.id !== exceptId && t.name.toLowerCase() === lower)) {
    throw new CommandError(`A tag named “${name}” already exists.`);
  }
}

export const createTag = defineCommand<{ name: string }, Id>({
  label: 'Add tag',
  run(draft, { name }, { now, newId }) {
    const trimmed = name.trim();
    if (!trimmed) throw new CommandError('Tag name is required.');
    assertUniqueName(draft.tags, trimmed);
    const tag: Tag = { id: newId('tag'), name: trimmed, updatedAt: now };
    draft.tags[tag.id] = tag;
    return tag.id;
  },
});

export const updateTag = defineCommand<{
  id: Id;
  changes: { name?: string; color?: string | undefined; archived?: true | undefined };
}>({
  label: 'Edit tag',
  run(draft, { id, changes }, { now }) {
    const tag = required(draft.tags[id], 'Tag');
    if (changes.name !== undefined) {
      const trimmed = changes.name.trim();
      if (!trimmed) throw new CommandError('Tag name is required.');
      assertUniqueName(draft.tags, trimmed, id);
    }
    applyChanges(tag, {
      ...(changes.name !== undefined ? { name: changes.name.trim() } : {}),
      ...('color' in changes ? { color: changes.color } : {}),
      ...('archived' in changes ? { archived: changes.archived } : {}),
    });
    tag.updatedAt = now;
  },
});

/** Deletes a tag and removes it from every transaction and split. */
export const deleteTag = defineCommand<{ id: Id }>({
  label: 'Delete tag',
  run(draft, { id }, { now }) {
    required(draft.tags[id], 'Tag');
    const usedByBudget = Object.values(draft.budgets.custom).find((b) => b.match.tags.includes(id));
    if (usedByBudget) {
      throw new CommandError(
        `This tag defines the “${usedByBudget.name}” budget. Change that budget first.`,
      );
    }
    const base: DocModel = original(draft);
    const affected: Id[] = [];
    for (const t of iterateTransactions(base)) {
      if (t.tags?.includes(id) || t.splits?.some((s) => s.tags?.includes(id))) affected.push(t.id);
    }
    for (const txnId of affected) {
      const t = getTransaction(draft, txnId);
      if (!t) continue;
      applyChanges(t, { tags: t.tags?.filter((x) => x !== id) });
      for (const s of t.splits ?? []) applyChanges(s, { tags: s.tags?.filter((x) => x !== id) });
      t.updatedAt = now;
    }
    Reflect.deleteProperty(draft.tags, id);
    tombstone(draft, id, now);
  },
});
