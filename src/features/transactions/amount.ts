import { parseMoney, type Cents } from '@/lib/money';

/**
 * Amounts are signed from the account's point of view. Typing "42.10" without a sign
 * means money out (spending) for a new transaction, or income if the category is an
 * income category; when editing, it keeps the previous sign. "+" or "-" is always explicit.
 */
export function resolveAmount(
  text: string,
  ctx: { previous: Cents | undefined; income: boolean },
): Cents | null {
  const trimmed = text.trim();
  const cents = parseMoney(trimmed);
  if (cents === null) return null;
  if (/^[+\-(]/.test(trimmed)) return cents;
  const abs = Math.abs(cents);
  if (ctx.previous !== undefined) return ctx.previous < 0 ? -abs : abs;
  return ctx.income ? abs : -abs;
}
