import { Anchor, Breadcrumbs } from '@mantine/core';
import { clsx } from 'clsx';
import { useMemo, useState } from 'react';
import { ColumnChart } from '@/components/charts/ColumnChart';
import { categoryTree } from '@/domain/aggregates/lookups';
import { UNCATEGORIZED } from '@/domain/aggregates/docIndex';
import {
  categoryBreakdown,
  GENERAL,
  isWholeMonths,
  OTHER,
  spendingByCategory,
  type ReportPeriod,
} from '@/domain/reports/reports';
import type { Id } from '@/domain/schema/types';
import { useFormat } from '@/hooks/useFormat';
import { diffDays } from '@/lib/date';
import { ReportSection } from './ReportSection';
import { useReportDeps } from './useReportDeps';
import { columnLabels, columnTitles, seriesColor } from './useReportPeriod';
import styles from './CategoryReport.module.scss';
import t from './reportTable.module.scss';

/**
 * Where the money went: spending over time stacked by category (top 7 plus Other), and
 * categories ranked with the change vs. the previous period. Both drill into a category.
 */
export function CategoryReport({ period }: { period: ReportPeriod }) {
  const { index, indexVersion, categories, transactions } = useReportDeps();
  const [parentId, setParentId] = useState<Id | null>(null);
  const format = useFormat();

  const data = useMemo(() => {
    if (!index || !categories || !transactions) return null;
    const doc = { categories, transactions };
    const report = spendingByCategory(doc, index, period.columns, parentId, 7);
    // Colors follow the category (its place in your category list), not its rank this period.
    const tree = categoryTree(categories);
    const position = (key: Id) => tree.nodes.findIndex((n) => n.category.id === key);
    const named = report.series.filter((s) => s.key !== OTHER);
    const byTreeOrder = [...named].sort((a, b) => position(a.key) - position(b.key));
    const slot = new Map(byTreeOrder.map((s, i) => [s.key, i + 1]));
    return {
      tree,
      breakdown: categoryBreakdown(doc, index, period, parentId),
      totals: report.totals,
      series: report.series.map((s) => ({
        ...s,
        color: s.key === OTHER ? seriesColor('other') : seriesColor(slot.get(s.key) ?? 1),
      })),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- indexVersion tracks in-place index changes.
  }, [index, indexVersion, categories, transactions, period, parentId]);

  if (!data) return null;
  const { tree, breakdown } = data;
  const labels = columnLabels(period);
  const titles = columnTitles(period, format.date);
  const unit = period.unit;
  const average = period.columns.length ? Math.round(breakdown.total / period.columns.length) : 0;
  const days = diffDays(period.from, period.to) + 1;
  const months = period.months.length;
  const previousLabel = isWholeMonths(period)
    ? `the previous ${months === 1 ? 'month' : `${String(months)} months`}`
    : `the previous ${String(days)} days`;

  const parentName = parentId ? tree.byId.get(parentId)?.category.name : undefined;
  const ancestors: { id: Id; name: string }[] = [];
  for (let id = parentId; id; id = tree.byId.get(id)?.category.parentId ?? null) {
    ancestors.unshift({ id, name: tree.byId.get(id)?.category.name ?? '' });
  }
  const drillable = (key: Id) => key !== UNCATEGORIZED && key !== GENERAL && key !== OTHER;
  const max = Math.max(1, ...breakdown.rows.map((r) => r.total));

  const delta = (current: number, previous: number) => {
    if (previous === 0) return <span className={t.dim}>new</span>;
    const d = current - previous;
    const pct = Math.round((d / previous) * 100);
    return (
      <span className={d > 0 ? t.up : d < 0 ? t.down : t.dim}>
        {d === 0
          ? '—'
          : `${format.money(d, { sign: 'always' })} (${pct > 0 ? '+' : ''}${String(pct)}%)`}
      </span>
    );
  };

  const name = (key: Id, label: string, hasChildren: boolean) =>
    hasChildren && drillable(key) ? (
      <Anchor
        component="button"
        size="sm"
        onClick={() => {
          setParentId(key);
        }}
      >
        {label} ›
      </Anchor>
    ) : (
      label
    );

  const crumbs = parentId && (
    <Breadcrumbs separator="›" className={styles.crumbs}>
      <Anchor
        component="button"
        size="xs"
        onClick={() => {
          setParentId(null);
        }}
      >
        All
      </Anchor>
      {ancestors.map((a) => (
        <Anchor
          key={a.id}
          component="button"
          size="xs"
          onClick={() => {
            setParentId(a.id);
          }}
        >
          {a.name}
        </Anchor>
      ))}
    </Breadcrumbs>
  );

  // A single month (or less) shows as one column: the breakdown says it better.
  const showOverTime = !(unit === 'month' && period.columns.length === 1);

  return (
    <div className={styles.root}>
      <ReportSection
        title={parentName ? `${parentName} spending` : 'Spending by category'}
        subtitle={
          <>
            {format.money(breakdown.total)} total
            {showOverTime && (
              <>
                {' '}
                · {format.money(average)} a {unit} on average
              </>
            )}{' '}
            · {delta(breakdown.total, breakdown.previousTotal)} vs. {previousLabel}
          </>
        }
        controls={crumbs}
        chart={
          <table className={clsx(t.table, styles.breakdown)}>
            <thead>
              <tr>
                <th>Category</th>
                <th aria-label="Share" />
                <th>Spent</th>
                <th>Share</th>
                <th>vs. previous</th>
              </tr>
            </thead>
            <tbody>
              {breakdown.rows.map((r) => (
                <tr key={r.key}>
                  <td>{name(r.key, r.label, r.hasChildren)}</td>
                  <td className={styles.barCell}>
                    <span
                      className={styles.bar}
                      style={{ width: `${String(Math.max(0, (r.total / max) * 100))}%` }}
                    />
                  </td>
                  <td>{format.money(r.total)}</td>
                  <td className={t.dim}>{Math.round(r.share * 100)}%</td>
                  <td>{delta(r.total, r.previous)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        }
        table={
          <table className={t.table}>
            <thead>
              <tr>
                <th>Category</th>
                <th>Spent</th>
                <th>Share</th>
                <th>Previous period</th>
                <th>Change</th>
              </tr>
            </thead>
            <tbody>
              {breakdown.rows.map((r) => (
                <tr key={r.key}>
                  <td>{r.label}</td>
                  <td>{format.money(r.total)}</td>
                  <td>{(r.share * 100).toFixed(1)}%</td>
                  <td>{format.money(r.previous)}</td>
                  <td>{delta(r.total, r.previous)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        }
      />
      {showOverTime && (
        <ReportSection
          title={unit === 'day' ? 'Daily spending' : 'Monthly spending'}
          chart={
            <ColumnChart
              columns={labels}
              columnTitles={titles}
              series={data.series}
              mode="stacked"
              height={260}
              formatValue={(c) => format.money(c)}
              formatAxis={format.moneyCompact}
              label={`${unit === 'day' ? 'Daily' : 'Monthly'} spending stacked by category`}
            />
          }
          table={
            <table className={t.table}>
              <thead>
                <tr>
                  <th className={t.sticky}>Category</th>
                  {period.columns.map((c, i) => (
                    <th key={c.key} title={titles[i]}>
                      {labels[i]}
                    </th>
                  ))}
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {data.series.map((s) => (
                  <tr key={s.key}>
                    <td className={t.sticky}>{s.label}</td>
                    {s.values.map((v, i) => (
                      <td key={period.columns[i]?.key} className={v === 0 ? t.dim : undefined}>
                        {v === 0 ? '—' : format.money(v)}
                      </td>
                    ))}
                    <td>{format.money(s.total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className={t.sticky}>Total</td>
                  {data.totals.map((v, i) => (
                    <td key={period.columns[i]?.key}>{format.money(v)}</td>
                  ))}
                  <td>{format.money(breakdown.total)}</td>
                </tr>
              </tfoot>
            </table>
          }
        />
      )}
    </div>
  );
}
