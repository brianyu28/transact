import { useMemo } from 'react';
import { ColumnChart } from '@/components/charts/ColumnChart';
import { StatTile } from '@/components/StatTile/StatTile';
import { incomeVsSpending } from '@/domain/reports/reports';
import { useFormat } from '@/hooks/useFormat';
import type { MonthKey } from '@/lib/date';
import { ReportSection } from './ReportSection';
import { useReportDeps } from './useReportDeps';
import { longMonthLabel, seriesColor, shortMonthLabels } from './useReportMonths';
import styles from './IncomeReport.module.scss';
import t from './reportTable.module.scss';

const rate = (income: number, net: number) =>
  income > 0 ? `${Math.round((net / income) * 100)}%` : '—';

/** Income vs. spending each month, and how much was saved. */
export function IncomeReport({ months }: { months: MonthKey[] }) {
  const { index, indexVersion, categories } = useReportDeps();
  const format = useFormat();
  const rows = useMemo(
    () => (index && categories ? incomeVsSpending({ categories }, index, months) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- indexVersion tracks in-place index changes.
    [index, indexVersion, categories, months],
  );
  const income = rows.reduce((s, r) => s + r.income, 0);
  const spending = rows.reduce((s, r) => s + r.spending, 0);
  const net = income - spending;

  return (
    <div className={styles.root}>
      <div className={styles.tiles}>
        <StatTile label="Income" value={format.money(income)} />
        <StatTile label="Spending" value={format.money(spending)} />
        <StatTile label={net >= 0 ? 'Saved' : 'Overspent'} value={format.money(Math.abs(net))} />
        <StatTile label="Savings rate" value={rate(income, net)} />
      </div>
      <ReportSection
        title="Income vs. spending"
        subtitle="Transfers between your accounts and excluded transactions aren’t counted."
        chart={
          <ColumnChart
            columns={shortMonthLabels(months)}
            columnTitles={months.map(longMonthLabel)}
            series={[
              {
                key: 'income',
                label: 'Income',
                color: seriesColor(3),
                values: rows.map((r) => r.income),
              },
              {
                key: 'spending',
                label: 'Spending',
                color: seriesColor(1),
                values: rows.map((r) => r.spending),
              },
            ]}
            mode="grouped"
            height={240}
            formatValue={(c) => format.money(c)}
            formatAxis={format.moneyCompact}
            label="Monthly income and spending"
          />
        }
        table={
          <table className={t.table}>
            <thead>
              <tr>
                <th>Month</th>
                <th>Income</th>
                <th>Spending</th>
                <th>Net</th>
                <th>Savings rate</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.month}>
                  <td>{longMonthLabel(r.month)}</td>
                  <td>{format.money(r.income)}</td>
                  <td>{format.money(r.spending)}</td>
                  <td className={r.net < 0 ? t.over : undefined}>{format.money(r.net)}</td>
                  <td className={t.dim}>{rate(r.income, r.net)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>Total</td>
                <td>{format.money(income)}</td>
                <td>{format.money(spending)}</td>
                <td>{format.money(net)}</td>
                <td>{rate(income, net)}</td>
              </tr>
            </tfoot>
          </table>
        }
      />
    </div>
  );
}
