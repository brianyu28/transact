import { describe, expect, it } from 'vitest';
import { displayFileName, fileExtension } from './format';

describe('displayFileName', () => {
  it('hides data file extensions', () => {
    expect(displayFileName('Budget.transact.json')).toBe('Budget');
    expect(displayFileName('Budget.TRANSACT')).toBe('Budget');
    expect(displayFileName('Budget 2026.json')).toBe('Budget 2026');
    expect(displayFileName('notes.txt')).toBe('notes.txt');
    expect(displayFileName('.json')).toBe('.json');
  });

  it('finds the extension to keep when renaming', () => {
    expect(fileExtension('a.transact.json')).toBe('.transact.json');
    expect(fileExtension('a.transact')).toBe('.transact');
    expect(fileExtension('a.json')).toBe('.json');
    expect(fileExtension('a')).toBe('');
  });
});
