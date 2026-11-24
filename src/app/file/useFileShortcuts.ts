import { useHotkeys } from '@mantine/hooks';
import { docStore } from '@/store/docStore';
import { session } from '@/store/sessionStore';

/**
 * Global file and history shortcuts. Temporary: these move into the keyboard command
 * registry (with user-customizable bindings) in phase 2.
 */
export function useFileShortcuts(guard: (action: () => unknown) => void): void {
  // Save works even while typing in a field.
  useHotkeys([['mod+S', () => void session.save()]], []);
  useHotkeys([
    [
      'mod+O',
      () => {
        guard(session.open);
      },
    ],
    [
      'mod+Z',
      () => {
        docStore.getState().undo();
      },
    ],
    [
      'mod+shift+Z',
      () => {
        docStore.getState().redo();
      },
    ],
  ]);
}
