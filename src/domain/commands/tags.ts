import type { Id, Tag } from '../schema/types';
import { CommandError, defineCommand } from './define';

export const createTag = defineCommand<{ name: string }, Id>({
  label: 'Add tag',
  run(draft, { name }, { now, newId }) {
    const trimmed = name.trim();
    const existing = Object.values(draft.tags).find(
      (t) => t.name.toLowerCase() === trimmed.toLowerCase(),
    );
    if (existing) throw new CommandError(`Tag "${trimmed}" already exists`);
    const tag: Tag = { id: newId('tag'), name: trimmed, updatedAt: now };
    draft.tags[tag.id] = tag;
    return tag.id;
  },
});
