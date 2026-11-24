import type { FileSettings } from '../schema/types';
import { defineCommand } from './define';

export const updateSettings = defineCommand<Partial<FileSettings>>({
  label: 'Change settings',
  run(draft, changes) {
    Object.assign(draft.settings, changes);
  },
});
