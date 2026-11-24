/**
 * Key binding syntax: a binding is a sequence of combos separated by spaces ("g t"), and
 * a combo is modifiers plus a key joined by "+" ("mod+shift+z"). "mod" is ⌘ on Apple
 * platforms and Ctrl elsewhere. Keys are lower-case `KeyboardEvent.key` values, with
 * names for special keys: escape, enter, space, delete, backspace, arrowup, tab, …
 */
export const IS_APPLE =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);

const MODIFIER_ORDER = ['mod', 'ctrl', 'alt', 'shift'] as const;
const KEY_NAMES: Record<string, string> = { ' ': 'space', esc: 'escape', del: 'delete' };

/** Normalizes a combo string so equivalent spellings compare equal. */
export function normalizeCombo(combo: string): string {
  const parts = combo.toLowerCase().split('+');
  // "+" itself as the key: "shift++" splits into [..., '', ''].
  const key = parts.at(-1) === '' ? '+' : (parts.pop() ?? '');
  const mods = new Set(
    parts
      .filter(Boolean)
      .map((m) =>
        m === 'cmd' || m === 'meta' ? 'mod' : m === 'control' ? 'ctrl' : m === 'option' ? 'alt' : m,
      ),
  );
  return [...MODIFIER_ORDER.filter((m) => mods.has(m)), KEY_NAMES[key] ?? key].join('+');
}

export function normalizeBinding(binding: string): string {
  return binding.trim().split(/\s+/).map(normalizeCombo).join(' ');
}

/** The combo for a keyboard event, or null for a bare modifier press. */
export function comboFromEvent(e: KeyboardEvent): string | null {
  if (['Meta', 'Control', 'Alt', 'Shift', 'CapsLock'].includes(e.key)) return null;
  let key = e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase();
  if (key === ' ') key = 'space';
  // With Alt on macOS, e.key is a special character; use the physical key instead.
  if (e.altKey && /^Key[A-Z]$/.test(e.code)) key = e.code.slice(3).toLowerCase();
  const mods: string[] = [];
  const mod = IS_APPLE ? e.metaKey : e.ctrlKey;
  if (mod) mods.push('mod');
  if (IS_APPLE && e.ctrlKey) mods.push('ctrl');
  if (e.altKey) mods.push('alt');
  // Shift is part of printable symbols already ("?" not "shift+/"), so only record it
  // for letters and named keys.
  if (e.shiftKey && (/^[a-z]$/.test(key) || key.length > 1)) mods.push('shift');
  return [...mods, KEY_NAMES[key] ?? key].join('+');
}

const DISPLAY: Record<string, string> = IS_APPLE
  ? { mod: '⌘', ctrl: '⌃', alt: '⌥', shift: '⇧' }
  : { mod: 'Ctrl', ctrl: 'Ctrl', alt: 'Alt', shift: 'Shift' };
const KEY_DISPLAY: Record<string, string> = {
  escape: 'Esc',
  enter: '↵',
  space: 'Space',
  arrowup: '↑',
  arrowdown: '↓',
  arrowleft: '←',
  arrowright: '→',
  backspace: '⌫',
  delete: 'Del',
  tab: 'Tab',
};

/** Display form of one combo as key caps, e.g. "mod+shift+z" → ["⌘", "⇧", "Z"]. */
export function comboCaps(combo: string): string[] {
  const parts = normalizeCombo(combo).split('+');
  const key = parts.pop() ?? '';
  return [
    ...parts.map((m) => DISPLAY[m] ?? m),
    KEY_DISPLAY[key] ?? (key.length === 1 ? key.toUpperCase() : key),
  ];
}
