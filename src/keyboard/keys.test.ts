import { describe, expect, it } from 'vitest';
import { comboFromEvent, normalizeBinding } from './keys';

const ev = (key: string, init: KeyboardEventInit = {}) =>
  new KeyboardEvent('keydown', { key, ...init });

describe('keys', () => {
  it('normalizes binding spellings', () => {
    expect(normalizeBinding('Shift+Mod+Z')).toBe('mod+shift+z');
    expect(normalizeBinding('cmd+K')).toBe('mod+k');
    expect(normalizeBinding('g   T')).toBe('g t');
    expect(normalizeBinding('Esc')).toBe('escape');
  });

  it('reads combos from events', () => {
    expect(comboFromEvent(ev('j'))).toBe('j');
    expect(comboFromEvent(ev('X', { shiftKey: true }))).toBe('shift+x');
    expect(comboFromEvent(ev('?', { shiftKey: true }))).toBe('?');
    expect(comboFromEvent(ev('Escape'))).toBe('escape');
    expect(comboFromEvent(ev('Shift', { shiftKey: true }))).toBeNull();
    expect(comboFromEvent(ev('s', { ctrlKey: true }))).toBe('mod+s'); // jsdom is not Apple
  });
});
