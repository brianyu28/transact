import type { Category, CategoryKind, Id } from '../schema/types';
import { CommandError, defineCommand } from './define';

export const createCategory = defineCommand<
  { name: string; parentId: Id | null; kind?: CategoryKind },
  Id
>({
  label: 'Add category',
  run(draft, { name, parentId, kind }, { now, newId }) {
    if (parentId !== null && !draft.categories[parentId])
      throw new CommandError('Parent category not found');
    const siblings = Object.values(draft.categories).filter((c) => c.parentId === parentId);
    const category: Category = {
      id: newId('category'),
      name: name.trim(),
      parentId,
      order: Math.max(-1, ...siblings.map((c) => c.order)) + 1,
      updatedAt: now,
    };
    if (kind && parentId === null) category.kind = kind;
    draft.categories[category.id] = category;
    return category.id;
  },
});
