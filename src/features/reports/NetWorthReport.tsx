import { useMemo } from 'react';
import { ColumnChart } from '@/components/charts/ColumnChart';
import { StatTile } from '@/components/StatTile/StatTile';
import { netWorthChanges } from '@/domain/reports/reports';
import { useFormat } from '@/hooks/useFormat';
import { today, type MonthKey } from '@/lib/date';
import { ReportSection } from './ReportSection';
import { useReportDeps } from './useReportDeps';
import { longMonthLabel, seriesColor, shortMonthLabels } from './useReportMonths';
import styles from './IncomeReport.module.scss';
import t from './reportTable.module.scss';

/** How net worth changed each month: what you saved vs. what markets (balance updates) did. */
export function NetWorthReport({ months }: { months: MonthKey[] }) {
  const { index, indexVersion, accounts, snapshots } = useReportDeps();
  const format = useFormat();
  const rows = useMemo(
    () =>
      index && accounts && snapshots
        ? netWorthChanges({ accounts, balanceSnapshots: snapshots }, index, months, today())
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- indexVersion tracks in-place index changes.
    [index, indexVersion, accounts, snapshots, months],
  );
  const saved = rows.reduce((s, r) => s + r.saved, 0);
  const market = rows.reduce((s, r) => s + r.market, 0);
  const signed = (c: number) => format.money(c, { sign: 'always' });

  return (
    <div className={styles.root}>
      <div className={styles.tiles}>
        <StatTile label="Net worth change" value={signed(saved + market)} />
        <StatTile label="From saving" value={signed(saved)} />
        <StatTile label="From market & adjustments" value={signed(market)} />
        <StatTile label="Net worth now" value={format.money(rows.at(-1)?.end ?? 0)} />
      </div>
      <ReportSection
        title="Net worth change"
        subtitle="Saving: what your transactions added (income minus spending). Market: changes recorded by balance updates, such as investment growth."
        chart={
          <ColumnChart
            columns={shortMonthLabels(months)}
            columnTitles={months.map(longMonthLabel)}
            series={[
              {
                key: 'saved',
                label: 'Saving',
                color: seriesColor(1),
                values: rows.map((r) => r.saved),
              },
              {
                key: 'market',
                label: 'Market & adjustments',
                color: seriesColor(2),
                values: rows.map((r) => r.market),
              },
            ]}
            mode="stacked"
            height={240}
            formatValue={signed}
            formatAxis={format.moneyCompact}
            label="Monthly net worth change split into saving and market change"
          />
        }
        table={
          <table className={t.table}>
            <thead>
              <tr>
                <th>Month</th>
                <th>Start</th>
                <th>Saving</th>
                <th>Market & adjustments</th>
                <th>Change</th>
                <th>End</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.month}>
                  <td>{longMonthLabel(r.month)}</td>
                  <td className={t.dim}>{format.money(r.start)}</td>
                  <td>{signed(r.saved)}</td>
                  <td>{signed(r.market)}</td>
                  <td className={r.change < 0 ? t.over : undefined}>{signed(r.change)}</td>
                  <td>{format.money(r.end)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        }
      />
    </div>
  );
}
