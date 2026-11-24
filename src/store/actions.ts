/** Helpers for UI code to run document commands with user-facing error handling. */
import {
  CommandError,
  type CommandName,
  type CommandPayload,
  type CommandResult,
} from '@/domain/commands';
import { docStore } from './docStore';
import { toast } from './toastStore';

/**
 * Dispatches a command; if it's rejected (CommandError), shows the reason as a toast and
 * returns undefined instead of throwing.
 */
export function tryDispatch<K extends CommandName>(
  name: K,
  payload: CommandPayload<K>,
): CommandResult<K> | undefined {
  try {
    return docStore.getState().dispatch(name, payload);
  } catch (err) {
    if (err instanceof CommandError) {
      toast(err.message, { kind: 'error' });
      return undefined;
    }
    throw err;
  }
}

/** Like `tryDispatch`, but reports success as a boolean (for commands that return nothing). */
export function tryRun<K extends CommandName>(name: K, payload: CommandPayload<K>): boolean {
  try {
    docStore.getState().dispatch(name, payload);
    return true;
  } catch (err) {
    if (err instanceof CommandError) {
      toast(err.message, { kind: 'error' });
      return false;
    }
    throw err;
  }
}

/** Shows "<message> · Undo" after a destructive action. */
export function toastWithUndo(message: string): void {
  toast(message, {
    action: {
      label: 'Undo',
      run: () => {
        docStore.getState().undo();
      },
    },
  });
}
