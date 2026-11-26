import { Switch } from '@mantine/core';
import { useMemo } from 'react';
import { ColumnChart } from '@/components/charts/ColumnChart';
import { StatTile } from '@/components/StatTile/StatTile';
import { incomeVsSpending } from '@/domain/reports/reports';
import { useFormat } from '@/hooks/useFormat';
import { usePrefs } from '@/store/prefsStore';
import type { ReportPeriod } from '@/domain/reports/reports';
import { ReportSection } from './ReportSection';
import { useReportDeps } from './useReportDeps';
import { columnLabels, columnTitles, seriesColor } from './useReportPeriod';
import styles from './IncomeReport.module.scss';
import t from './reportTable.module.scss';

const rate = (income: number, net: number) =>
  income > 0 ? `${Math.round((net / income) * 100)}%` : '—';

/** Income vs. spending each month, and how much was saved. */
export function IncomeReport({ period }: { period: ReportPeriod }) {
  const { index, indexVersion, categories, transactions } = useReportDeps();
  const format = useFormat();
  const includeExcluded = usePrefs((s) => s.incomeIncludesExcluded);
  const setPref = usePrefs((s) => s.setPref);
  const rows = useMemo(
    () =>
      index && categories && transactions
        ? incomeVsSpending({ categories, transactions }, index, period.columns, {
            includeExcluded,
          })
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- indexVersion tracks in-place index changes.
    [index, indexVersion, categories, transactions, period, includeExcluded],
  );
  const income = rows.reduce((s, r) => s + r.income, 0);
  const spending = rows.reduce((s, r) => s + r.spending, 0);
  const net = income - spending;
  const titles = columnTitles(period, format.date);
  const daily = period.unit === 'day';

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
        subtitle={
          includeExcluded
            ? 'Transfers between your accounts aren’t counted.'
            : 'Transfers between your accounts and excluded transactions aren’t counted.'
        }
        controls={
          <Switch
            size="xs"
            label="Count excluded transactions"
            checked={includeExcluded}
            onChange={(e) => {
              setPref('incomeIncludesExcluded', e.currentTarget.checked);
            }}
          />
        }
        chart={
          <ColumnChart
            columns={columnLabels(period)}
            columnTitles={titles}
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
            label={`${daily ? 'Daily' : 'Monthly'} income and spending`}
          />
        }
        table={
          <table className={t.table}>
            <thead>
              <tr>
                <th>{daily ? 'Day' : 'Month'}</th>
                <th>Income</th>
                <th>Spending</th>
                <th>Net</th>
                <th>Savings rate</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={period.columns[i]?.key}>
                  <td>{titles[i]}</td>
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
