import { Select } from '@mantine/core';
import { useMemo, useState } from 'react';
import { ColumnChart } from '@/components/charts/ColumnChart';
import { categoryTree } from '@/domain/aggregates/lookups';
import { OTHER, spendingByCategory } from '@/domain/reports/reports';
import type { Id } from '@/domain/schema/types';
import { useFormat } from '@/hooks/useFormat';
import type { MonthKey } from '@/lib/date';
import { ReportSection } from './ReportSection';
import { useReportDeps } from './useReportDeps';
import { longMonthLabel, seriesColor, shortMonthLabels } from './useReportMonths';
import t from './reportTable.module.scss';

/** Monthly spending, stacked by category (top 7 plus Other), optionally within one category. */
export function SpendingReport({ months }: { months: MonthKey[] }) {
  const { index, indexVersion, categories } = useReportDeps();
  const [parentId, setParentId] = useState<Id | null>(null);
  const format = useFormat();

  const data = useMemo(() => {
    if (!index || !categories) return null;
    const report = spendingByCategory({ categories }, index, months, parentId, 7);
    // Colors follow the category (its place in your category list), not its rank this period.
    const tree = categoryTree(categories);
    const position = (key: Id) => tree.nodes.findIndex((n) => n.category.id === key);
    const named = report.series.filter((s) => s.key !== OTHER);
    const byTreeOrder = [...named].sort((a, b) => position(a.key) - position(b.key));
    const slot = new Map(byTreeOrder.map((s, i) => [s.key, i + 1]));
    return {
      ...report,
      series: report.series.map((s) => ({
        ...s,
        color: s.key === OTHER ? seriesColor('other') : seriesColor(slot.get(s.key) ?? 1),
      })),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- indexVersion tracks in-place index changes.
  }, [index, indexVersion, categories, months, parentId]);

  const parents = useMemo(
    () =>
      categories
        ? categoryTree(categories)
            .nodes.filter((n) => n.depth === 0 && n.kind === 'expense' && n.subtree.length > 1)
            .map((n) => ({ value: n.category.id, label: n.category.name }))
        : [],
    [categories],
  );

  if (!data) return null;
  const total = data.totals.reduce((s, v) => s + v, 0);
  const average = months.length ? Math.round(total / months.length) : 0;

  return (
    <ReportSection
      title="Spending by category"
      subtitle={`${format.money(total)} total · ${format.money(average)} a month on average`}
      controls={
        <Select
          size="xs"
          placeholder="All categories"
          aria-label="Within category"
          data={parents}
          value={parentId}
          onChange={setParentId}
          clearable
          w={180}
        />
      }
      chart={
        <ColumnChart
          columns={shortMonthLabels(months)}
          columnTitles={months.map(longMonthLabel)}
          series={data.series}
          mode="stacked"
          height={260}
          formatValue={(c) => format.money(c)}
          formatAxis={format.moneyCompact}
          label="Monthly spending stacked by category"
        />
      }
      table={
        <table className={t.table}>
          <thead>
            <tr>
              <th className={t.sticky}>Category</th>
              {months.map((m, i) => (
                <th key={m}>{shortMonthLabels(months)[i]}</th>
              ))}
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {data.series.map((s) => (
              <tr key={s.key}>
                <td className={t.sticky}>{s.label}</td>
                {s.values.map((v, i) => (
                  <td key={months[i]} className={v === 0 ? t.dim : undefined}>
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
                <td key={months[i]}>{format.money(v)}</td>
              ))}
              <td>{format.money(total)}</td>
            </tr>
          </tfoot>
        </table>
      }
    />
  );
}
