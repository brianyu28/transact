import { describe, expect, it } from 'vitest';
import { displayFileName, fileExtension, formatBytes } from './format';

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

describe('formatBytes', () => {
  it('uses bytes, then KB/MB with one decimal below 10', () => {
    expect(formatBytes(1)).toBe('1 byte');
    expect(formatBytes(812)).toBe('812 bytes');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(200 * 1024)).toBe('200 KB');
    expect(formatBytes(3.25 * 1024 * 1024)).toBe('3.3 MB');
  });
});
