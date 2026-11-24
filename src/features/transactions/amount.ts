import { parseMoney, type Cents } from '@/lib/money';

/**
 * Amounts are saved exactly as typed, signed from the account's point of view:
 * "-42.10" is money out of the account and "42.10" (or "+42.10") is money in.
 */
export function resolveAmount(text: string): Cents | null {
  return parseMoney(text.trim());
}
