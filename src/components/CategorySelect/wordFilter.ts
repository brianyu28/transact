import { isOptionsGroup, type ComboboxItem, type OptionsFilter } from '@mantine/core';

/**
 * True if every word of `search` appears somewhere in `label`, ignoring case and
 * separators, so "food groc" finds "Food › Groceries" and "transfer amex" finds
 * "Transfer ↔ Amex".
 */
export function matchesWords(label: string, search: string): boolean {
  const text = label.toLowerCase();
  return search
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => /[\p{L}\p{N}]/u.test(word))
    .every((word) => text.includes(word));
}

/** Mantine combobox filter using `matchesWords`, keeping groups. */
export const wordFilter: OptionsFilter = ({ options, search, limit }) => {
  const out: typeof options = [];
  let count = 0;
  for (const option of options) {
    if (count >= limit) break;
    if (isOptionsGroup(option)) {
      const items: ComboboxItem[] = [];
      for (const item of option.items) {
        if (count >= limit) break;
        if (matchesWords(item.label, search)) {
          items.push(item);
          count++;
        }
      }
      if (items.length) out.push({ group: option.group, items });
    } else if (matchesWords(option.label, search)) {
      out.push(option);
      count++;
    }
  }
  return out;
};
