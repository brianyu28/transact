import { SegmentedControl, TextInput } from '@mantine/core';
import {
  RANGES,
  type RangeKey,
  type RangeOption,
  type RangeSelection,
} from '@/domain/aggregates/sampling';
import { useFormat } from '@/hooks/useFormat';
import { isISODate, type ISODate } from '@/lib/date';
import styles from './RangeControl.module.scss';

interface RangeControlProps {
  value: RangeSelection;
  onChange: (value: RangeSelection) => void;
  /** The presets offered; trailing ranges by default. */
  options?: readonly RangeOption[];
  /** The exact dates the screen covers; shown next to a preset so it isn't ambiguous. */
  span?: { from: ISODate; to: ISODate } | null;
}

/** Preset ranges plus "Custom" with from/to dates. */
export function RangeControl({ value, onChange, options = RANGES, span }: RangeControlProps) {
  const format = useFormat();
  const setDate = (key: 'from' | 'to', date: string) => {
    if (isISODate(date)) onChange({ ...value, [key]: date });
  };
  return (
    <div className={styles.root}>
      {value.key !== 'custom' && span && (
        <span className={styles.span} aria-label="Dates shown">
          {format.date(span.from)} – {format.date(span.to)}
        </span>
      )}
      {value.key === 'custom' && (
        <div className={styles.dates}>
          <TextInput
            size="xs"
            type="date"
            aria-label="From"
            value={value.from}
            max={value.to}
            onChange={(e) => {
              setDate('from', e.currentTarget.value);
            }}
          />
          <span className={styles.dash}>–</span>
          <TextInput
            size="xs"
            type="date"
            aria-label="To"
            value={value.to}
            min={value.from}
            onChange={(e) => {
              setDate('to', e.currentTarget.value);
            }}
          />
        </div>
      )}
      <SegmentedControl<RangeKey>
        size="xs"
        data={options.map((r) => ({ value: r.value, label: r.label }))}
        value={value.key}
        onChange={(key) => {
          onChange({ ...value, key });
        }}
        aria-label="Time range"
      />
    </div>
  );
}
