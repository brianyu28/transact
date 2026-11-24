import { useDiscardGuard } from './useDiscardGuard';
import { useFileShortcuts } from './useFileShortcuts';

/** Installs global file shortcuts (and the discard confirmation they may need). */
export function FileShortcuts() {
  const [guard, modal] = useDiscardGuard();
  useFileShortcuts(guard);
  return modal;
}
