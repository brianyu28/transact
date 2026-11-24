/**
 * Keyboard command registry and dispatcher. Components attach handlers to catalog ids;
 * the most recently attached enabled handler wins, so a focused screen can override a
 * global one. One keydown listener matches events (including multi-key sequences like
 * "g t") against the effective bindings: user overrides from device prefs, else defaults.
 */
import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import { prefsStore } from '@/store/prefsStore';
import { COMMANDS, COMMANDS_BY_ID, type CommandId, type CommandInfo } from './catalog';
import { comboFromEvent, normalizeBinding } from './keys';

export interface Handler {
  run: () => void;
  /** When false the command is skipped (and hidden from the palette). */
  enabled?: () => boolean;
}

interface RegistryState {
  /** Bumped when handlers change, so the palette can re-render. */
  version: number;
}

const handlers = new Map<string, Handler[]>();
export const registryStore = createStore<RegistryState>()(() => ({ version: 0 }));
const bump = () => {
  registryStore.setState((s) => ({ version: s.version + 1 }));
};

export function attachHandlers(map: Partial<Record<CommandId, Handler>>): () => void {
  const entries = Object.entries(map) as [CommandId, Handler][];
  for (const [id, handler] of entries) {
    const list = handlers.get(id) ?? [];
    list.push(handler);
    handlers.set(id, list);
  }
  bump();
  return () => {
    for (const [id, handler] of entries) {
      const list = handlers.get(id);
      if (!list) continue;
      const i = list.lastIndexOf(handler);
      if (i >= 0) list.splice(i, 1);
    }
    bump();
  };
}

function activeHandler(id: string): Handler | undefined {
  const list = handlers.get(id) ?? [];
  for (let i = list.length - 1; i >= 0; i--) {
    const h = list[i] as Handler;
    if (!h.enabled || h.enabled()) return h;
  }
  return undefined;
}

export function isCommandAvailable(id: string): boolean {
  return activeHandler(id) !== undefined;
}

export function runCommand(id: CommandId): boolean {
  const handler = activeHandler(id);
  if (!handler) return false;
  handler.run();
  return true;
}

/** Effective bindings for a command (user override or default), normalized. */
export function bindingsFor(id: string, overrides = prefsStore.getState().keybindings): string[] {
  const keys = overrides[id] ?? COMMANDS_BY_ID.get(id)?.keys ?? [];
  return keys.map(normalizeBinding);
}

export function useRegistryVersion(): number {
  return useStore(registryStore, (s) => s.version);
}

// ── Dispatcher ────────────────────────────────────────────────────────────────

const SEQUENCE_TIMEOUT_MS = 1000;

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  if (target instanceof HTMLInputElement) {
    return !['checkbox', 'radio', 'button', 'submit', 'reset'].includes(target.type);
  }
  return false;
}

function inDialog(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('[role="dialog"]') !== null;
}

let installed = false;

/** Installs the global keydown listener (idempotent). Returns an uninstall function. */
export function installKeyboard(): () => void {
  if (installed) return () => undefined;
  installed = true;
  let buffer: string[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.isComposing || e.repeat) return;
    const combo = comboFromEvent(e);
    if (!combo) return;
    const restricted = isTypingTarget(e.target) || inDialog(e.target);
    const overrides = prefsStore.getState().keybindings;
    const candidates = (COMMANDS as readonly CommandInfo[]).filter(
      (c) => (!restricted || c.allowInInputs) && activeHandler(c.id),
    );

    const tryMatch = (seq: string[]): 'run' | 'prefix' | 'none' => {
      const typed = seq.join(' ');
      let prefix = false;
      for (const c of candidates) {
        for (const binding of bindingsFor(c.id, overrides)) {
          if (binding === typed) {
            e.preventDefault();
            e.stopPropagation();
            runCommand(c.id as CommandId);
            return 'run';
          }
          if (binding.startsWith(`${typed} `)) prefix = true;
        }
      }
      return prefix ? 'prefix' : 'none';
    };

    clearTimeout(timer);
    let result = tryMatch([...buffer, combo]);
    if (result === 'none' && buffer.length > 0) {
      buffer = [];
      result = tryMatch([combo]);
    }
    if (result === 'prefix') {
      buffer = [...buffer, combo];
      e.preventDefault();
      timer = setTimeout(() => {
        buffer = [];
      }, SEQUENCE_TIMEOUT_MS);
    } else {
      buffer = [];
    }
  };

  window.addEventListener('keydown', onKeyDown);
  return () => {
    window.removeEventListener('keydown', onKeyDown);
    installed = false;
  };
}
