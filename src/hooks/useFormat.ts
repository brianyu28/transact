import { useMemo } from 'react';
import { formatDate, type ISODate } from '@/lib/date';
import { formatMoney, type Cents } from '@/lib/money';
import { useDocStore } from '@/store/docStore';
import { usePrefs, type DateFormatPref } from '@/store/prefsStore';

const DATE_OPTIONS: Record<DateFormatPref, Intl.DateTimeFormatOptions> = {
  medium: { month: 'short', day: 'numeric', year: 'numeric' },
  numeric: { month: 'numeric', day: 'numeric', year: 'numeric' },
  iso: {},
};

export interface Formatters {
  money: (
    cents: Cents,
    options?: { sign?: 'auto' | 'always' | 'never'; symbol?: boolean },
  ) => string;
  date: (date: ISODate) => string;
  currency: string;
  locale: string;
}

/** Money and date formatters that follow the file's currency/locale and the device's date format. */
export function useFormat(): Formatters {
  const currency = useDocStore((s) => s.doc?.settings.currency ?? 'USD');
  const locale = useDocStore((s) => s.doc?.settings.locale ?? 'en-US');
  const dateFormat = usePrefs((s) => s.dateFormat);
  return useMemo(
    () => ({
      currency,
      locale,
      money: (cents, options) => formatMoney(cents, { currency, locale, ...options }),
      date: (date) =>
        dateFormat === 'iso' ? date : formatDate(date, locale, DATE_OPTIONS[dateFormat]),
    }),
    [currency, locale, dateFormat],
  );
}
