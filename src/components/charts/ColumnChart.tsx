import { useElementSize } from '@mantine/hooks';
import { clsx } from 'clsx';
import { useState } from 'react';
import type { Cents } from '@/lib/money';
import { niceTicks } from './scale';
import styles from './ColumnChart.module.scss';

export interface ColumnSeries {
  key: string;
  label: string;
  /** CSS color, e.g. "var(--tx-series-1)". */
  color: string;
  values: readonly Cents[];
}

interface ColumnChartProps {
  /** X-axis labels (one per column). */
  columns: readonly string[];
  /** Full label for the tooltip title (defaults to the column label). */
  columnTitles?: readonly string[];
  series: readonly ColumnSeries[];
  mode: 'stacked' | 'grouped';
  height: number;
  formatValue: (cents: Cents) => string;
  formatAxis: (cents: Cents) => string;
  /** Accessible description; the data is also available as a table view. */
  label: string;
  /** Show a "Total" row in the tooltip (stacked charts). */
  showTotal?: boolean;
}

const MARGIN = { top: 8, right: 4, bottom: 22, left: 58 };
const GAP = 2; // surface gap between stacked segments and grouped bars
const RADIUS = 4;

/** Rect path with rounded corners on the data end only (square at the baseline). */
function barPath(x: number, y: number, w: number, h: number, roundTop: boolean): string {
  const r = Math.min(RADIUS, w / 2, h);
  if (h <= 0 || w <= 0) return '';
  if (roundTop) {
    return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
  }
  return `M${x},${y}V${y + h - r}Q${x},${y + h} ${x + r},${y + h}H${x + w - r}Q${x + w},${y + h} ${x + w},${y + h - r}V${y}Z`;
}

/**
 * Column chart (SVG) for monthly data: stacked (positives up, negatives down from a
 * shared zero baseline) or grouped. One y-axis, hairline grid, a legend for 2+ series,
 * and a per-column hover tooltip.
 */
export function ColumnChart({
  columns,
  columnTitles,
  series,
  mode,
  height,
  formatValue,
  formatAxis,
  label,
  showTotal = mode === 'stacked',
}: ColumnChartProps) {
  const { ref, width } = useElementSize();
  const [hover, setHover] = useState<number | null>(null);

  const n = columns.length;
  let max = 0;
  let min = 0;
  for (let i = 0; i < n; i++) {
    if (mode === 'stacked') {
      let pos = 0;
      let neg = 0;
      for (const s of series) {
        const v = s.values[i] ?? 0;
        if (v >= 0) pos += v;
        else neg += v;
      }
      max = Math.max(max, pos);
      min = Math.min(min, neg);
    } else {
      for (const s of series) {
        max = Math.max(max, s.values[i] ?? 0);
        min = Math.min(min, s.values[i] ?? 0);
      }
    }
  }
  const ticks = niceTicks(min, max);
  const yMin = ticks[0] ?? 0;
  const yMax = ticks.at(-1) ?? 1;
  const innerW = Math.max(0, width - MARGIN.left - MARGIN.right);
  const innerH = height - MARGIN.top - MARGIN.bottom;
  const y = (v: number) => MARGIN.top + ((yMax - v) / (yMax - yMin || 1)) * innerH;
  const band = n > 0 ? innerW / n : 0;
  const barW =
    mode === 'stacked'
      ? Math.min(24, band * 0.6)
      : Math.min(16, (band * 0.7 - GAP * (series.length - 1)) / Math.max(1, series.length));
  // Thin out x labels so they never collide (~44px each).
  const every = Math.max(1, Math.ceil((n * 44) / Math.max(1, innerW)));

  const segments: { key: string; d: string; color: string }[] = [];
  for (let i = 0; i < n; i++) {
    const cx = MARGIN.left + band * i + band / 2;
    if (mode === 'stacked') {
      let pos = 0;
      let neg = 0;
      const posSeries = series.filter((s) => (s.values[i] ?? 0) > 0);
      const negSeries = series.filter((s) => (s.values[i] ?? 0) < 0);
      posSeries.forEach((s, k) => {
        const v = s.values[i] ?? 0;
        const top = y(pos + v);
        const bottom = y(pos) - (k > 0 ? GAP : 0);
        pos += v;
        segments.push({
          key: `${s.key}-${i}`,
          color: s.color,
          d: barPath(cx - barW / 2, top, barW, bottom - top, k === posSeries.length - 1),
        });
      });
      negSeries.forEach((s, k) => {
        const v = s.values[i] ?? 0;
        const top = y(neg) + (k > 0 ? GAP : 0);
        const bottom = y(neg + v);
        neg += v;
        segments.push({
          key: `${s.key}-${i}`,
          color: s.color,
          d: barPath(cx - barW / 2, top, barW, bottom - top, false),
        });
      });
    } else {
      const groupW = series.length * barW + (series.length - 1) * GAP;
      series.forEach((s, k) => {
        const v = s.values[i] ?? 0;
        const x = cx - groupW / 2 + k * (barW + GAP);
        const top = v >= 0 ? y(v) : y(0);
        const h = Math.abs(y(v) - y(0));
        segments.push({
          key: `${s.key}-${i}`,
          color: s.color,
          d: barPath(x, top, barW, h, v >= 0),
        });
      });
    }
  }

  const tooltipLeft = hover === null ? 0 : MARGIN.left + band * hover + band / 2;
  const total = hover === null ? 0 : series.reduce((s, x) => s + (x.values[hover] ?? 0), 0);

  return (
    <div className={styles.root}>
      {series.length > 1 && (
        <ul className={styles.legend} aria-label="Legend">
          {series.map((s) => (
            <li key={s.key}>
              <span className={styles.swatch} style={{ background: s.color }} />
              {s.label}
            </li>
          ))}
        </ul>
      )}
      <div ref={ref} className={styles.plot} style={{ height }}>
        {width > 0 && (
          <svg width={width} height={height} role="img" aria-label={label}>
            {ticks.map((t) => (
              <g key={t}>
                <line
                  x1={MARGIN.left}
                  x2={width - MARGIN.right}
                  y1={y(t)}
                  y2={y(t)}
                  className={t === 0 ? styles.zero : styles.grid}
                />
                <text x={MARGIN.left - 6} y={y(t)} className={styles.yLabel}>
                  {formatAxis(t)}
                </text>
              </g>
            ))}
            {hover !== null && (
              <rect
                x={MARGIN.left + band * hover}
                y={MARGIN.top}
                width={band}
                height={innerH}
                className={styles.hoverBand}
              />
            )}
            {segments.map((s) => (
              <path key={s.key} d={s.d} fill={s.color} />
            ))}
            {columns.map((c, i) =>
              i % every === 0 || i === n - 1 ? (
                <text
                  key={`${c}-${String(i)}`}
                  x={MARGIN.left + band * i + band / 2}
                  y={height - 6}
                  className={styles.xLabel}
                >
                  {c}
                </text>
              ) : null,
            )}
            {columns.map((c, i) => (
              <rect
                key={`hit-${c}-${i}`}
                x={MARGIN.left + band * i}
                y={MARGIN.top}
                width={band}
                height={innerH}
                fill="transparent"
                onMouseEnter={() => {
                  setHover(i);
                }}
                onMouseLeave={() => {
                  setHover(null);
                }}
              />
            ))}
          </svg>
        )}
        {hover !== null && (
          <div
            className={clsx(styles.tooltip, tooltipLeft > width * 0.6 && styles.tooltipLeft)}
            style={{ left: tooltipLeft }}
            role="status"
          >
            <div className={styles.tooltipTitle}>{columnTitles?.[hover] ?? columns[hover]}</div>
            {[...series].reverse().map((s) => (
              <div key={s.key} className={styles.tooltipRow}>
                <span className={styles.swatch} style={{ background: s.color }} />
                <span className={styles.tooltipLabel}>{s.label}</span>
                <span className={styles.tooltipValue}>{formatValue(s.values[hover] ?? 0)}</span>
              </div>
            ))}
            {showTotal && series.length > 1 && (
              <div className={clsx(styles.tooltipRow, styles.tooltipTotal)}>
                <span />
                <span className={styles.tooltipLabel}>Total</span>
                <span className={styles.tooltipValue}>{formatValue(total)}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
