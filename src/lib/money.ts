/**
 * Money is stored as an integer number of minor units (cents) to avoid floating-point
 * error. Conversion to/from human-readable strings happens only at the UI boundary.
 */
export type Cents = number;

export function isCents(value: unknown): value is Cents {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

export interface FormatMoneyOptions {
  currency?: string;
  locale?: string;
  /** Show a currency symbol (default true). */
  symbol?: boolean;
  /** 'auto' (default): minus sign for negatives; 'always': also '+' for positives; 'never'. */
  sign?: 'auto' | 'always' | 'never';
}

const formatters = new Map<string, Intl.NumberFormat>();

function formatter(opts: Required<FormatMoneyOptions>): Intl.NumberFormat {
  const key = `${opts.locale}|${opts.currency}|${opts.symbol}|${opts.sign}`;
  let f = formatters.get(key);
  if (!f) {
    const signDisplay = opts.sign === 'always' ? 'exceptZero' : opts.sign;
    f = new Intl.NumberFormat(opts.locale, {
      ...(opts.symbol
        ? { style: 'currency', currency: opts.currency }
        : { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      signDisplay,
    });
    formatters.set(key, f);
  }
  return f;
}

/** Formats cents for display, e.g. -123456 → "-$1,234.56". */
export function formatMoney(cents: Cents, options: FormatMoneyOptions = {}): string {
  const opts: Required<FormatMoneyOptions> = {
    currency: options.currency ?? 'USD',
    locale: options.locale ?? 'en-US',
    symbol: options.symbol ?? true,
    sign: options.sign ?? 'auto',
  };
  return formatter(opts).format(cents / 100);
}

/** Plain editable representation, e.g. -123456 → "-1234.56". Exact (no float math). */
export function centsToInput(cents: Cents): string {
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100);
  const frac = String(abs % 100).padStart(2, '0');
  return `${negative ? '-' : ''}${whole}.${frac}`;
}

const MONEY_RE = /^([+-])?\$?(\d*)(?:\.(\d*))?$/;

/**
 * Parses user input into cents without floating-point math.
 * Accepts "1234.56", "$1,234.56", "-12.3", "+5", ".5", "(12.30)" (accounting negative).
 * Rounds half away from zero beyond two decimals. Returns null if unparseable.
 */
export function parseMoney(input: string): Cents | null {
  let s = input.trim().replace(/[,\s]/g, '');
  let negative = false;
  if (s.startsWith('(') && s.endsWith(')')) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (s.startsWith('-$') || s.startsWith('+$')) s = s.charAt(0) + s.slice(2);
  const m = MONEY_RE.exec(s);
  if (!m) return null;
  const [, sign, wholeStr = '', fracStr = ''] = m;
  if (wholeStr === '' && fracStr === '') return null;
  if (sign === '-') negative = !negative;

  const whole = wholeStr === '' ? 0 : Number(wholeStr);
  const cents2 = Number((fracStr + '00').slice(0, 2));
  const roundUp = fracStr.length > 2 && Number(fracStr[2]) >= 5 ? 1 : 0;
  const value = whole * 100 + cents2 + roundUp;
  if (!Number.isSafeInteger(value)) return null;
  return negative && value !== 0 ? -value : value;
}

/** Sums cents exactly (integers stay exact up to 2^53). */
export function sumCents(values: Iterable<Cents>): Cents {
  let total = 0;
  for (const v of values) total += v;
  return total;
}
