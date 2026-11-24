import { useComputedColorScheme } from '@mantine/core';
import { useEffect, useMemo, useRef, useState } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { toEpochDay, type ISODate } from '@/lib/date';
import type { Cents } from '@/lib/money';
import styles from './TimeSeriesChart.module.scss';

interface TimeSeriesChartProps {
  dates: readonly ISODate[];
  values: readonly Cents[];
  height: number;
  /** Full value for the tooltip, e.g. "$12,345.67". */
  formatValue: (cents: Cents) => string;
  /** Compact value for the y-axis, e.g. "$12K". */
  formatAxis: (cents: Cents) => string;
  formatDate: (date: ISODate) => string;
  /** Accessible description of what's plotted. */
  label: string;
}

const cssVar = (name: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/**
 * Single-series time chart (uPlot, canvas): 2px line over a 10% area wash, recessive
 * hairline grid, and a crosshair with a tooltip that snaps to the nearest date.
 * Callers pass bucketed data (days/months), never one point per transaction.
 */
export function TimeSeriesChart({
  dates,
  values,
  height,
  formatValue,
  formatAxis,
  formatDate,
  label,
}: TimeSeriesChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<uPlot | null>(null);
  const [hover, setHover] = useState<{ idx: number; left: number } | null>(null);
  const scheme = useComputedColorScheme('light');

  const data = useMemo<uPlot.AlignedData>(
    () => [dates.map((d) => toEpochDay(d) * 86_400), values.map((v) => v / 100)],
    [dates, values],
  );
  const fmtRef = useRef({ formatAxis });
  useEffect(() => {
    fmtRef.current = { formatAxis };
  });

  // (Re)create the plot when the theme or height changes; data updates go through setData.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const color = cssVar('--tx-chart-1');
    const grid = cssVar('--tx-chart-grid');
    const text = cssVar('--tx-text-dim');
    const font = `11px ${cssVar('--tx-font') || 'sans-serif'}`;
    const plot = new uPlot(
      {
        width: el.clientWidth,
        height,
        tzDate: (ts) => uPlot.tzDate(new Date(ts * 1000), 'Etc/UTC'),
        legend: { show: false },
        padding: [8, 8, 0, 0],
        cursor: {
          y: false,
          drag: { x: false, y: false },
          points: { size: 8, width: 2, stroke: cssVar('--tx-bg'), fill: color },
        },
        scales: { x: { time: true } },
        axes: [
          {
            stroke: text,
            font,
            size: 24,
            grid: { show: false },
            ticks: { stroke: grid, width: 1, size: 4 },
          },
          {
            stroke: text,
            font,
            size: 60,
            gap: 6,
            grid: { stroke: grid, width: 1 },
            ticks: { show: false },
            values: (_u, ticks) => ticks.map((v) => fmtRef.current.formatAxis(Math.round(v * 100))),
          },
        ],
        series: [
          {},
          { stroke: color, width: 2, fill: `${color}1a`, points: { show: false }, spanGaps: true },
        ],
        hooks: {
          setCursor: [
            (u) => {
              const idx = u.cursor.idx;
              if (idx === null || idx === undefined) setHover(null);
              else
                setHover({ idx, left: u.over.offsetLeft + u.valToPos(u.data[0][idx] ?? 0, 'x') });
            },
          ],
        },
      },
      data,
      el,
    );
    plotRef.current = plot;
    const observer = new ResizeObserver(() => {
      plot.setSize({ width: el.clientWidth, height });
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      plot.destroy();
      plotRef.current = null;
    };
    // Data is applied by the effect below; recreating on data changes would lose hover state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [height, scheme]);

  useEffect(() => {
    plotRef.current?.setData(data);
  }, [data]);

  const hovered = hover ? { date: dates[hover.idx], value: values[hover.idx] } : null;

  return (
    <div className={styles.root} role="img" aria-label={label}>
      <div ref={containerRef} className={styles.plot} />
      {hover && hovered?.date !== undefined && hovered.value !== undefined && (
        <div className={styles.tooltip} style={{ left: hover.left }}>
          <span className={styles.tooltipDate}>{formatDate(hovered.date)}</span>
          <span className={styles.tooltipValue}>
            <span className={styles.key} aria-hidden />
            {formatValue(hovered.value)}
          </span>
        </div>
      )}
    </div>
  );
}
