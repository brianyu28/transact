import { Tooltip } from '@mantine/core';
import { clsx } from 'clsx';
import { useMemo } from 'react';
import { budgetHistory } from '@/domain/reports/reports';
import { useFormat } from '@/hooks/useFormat';
import { today, type MonthKey } from '@/lib/date';
import { ReportSection } from './ReportSection';
import { useReportDeps } from './useReportDeps';
import { longMonthLabel, shortMonthLabels } from './useReportMonths';
import styles from './BudgetHistoryReport.module.scss';
import t from './reportTable.module.scss';

/** Each monthly budget line, month by month: spent against budgeted. */
export function BudgetHistoryReport({ months }: { months: MonthKey[] }) {
  const { index, indexVersion, budgets, categories, settings, transactions } = useReportDeps();
  const format = useFormat();
  const history = useMemo(
    () =>
      index && budgets && categories && settings && transactions
        ? budgetHistory({ budgets, categories, settings, transactions }, index, months, today())
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- indexVersion tracks in-place index changes.
    [index, indexVersion, budgets, categories, settings, months],
  );
  if (!history) return null;
  const labels = shortMonthLabels(months);

  const grid = (showBudgeted: boolean) => (
    <table className={clsx(t.table, styles.grid)}>
      <thead>
        <tr>
          <th className={t.sticky}>Budget</th>
          {labels.map((l, i) => (
            <th key={months[i]}>{l}</th>
          ))}
          <th>Average</th>
        </tr>
      </thead>
      <tbody>
        {history.lines.map((line) => {
          const spent = line.cells.map((c) => c?.spent ?? 0);
          const avg = Math.round(spent.reduce((s, v) => s + v, 0) / Math.max(1, months.length));
          return (
            <tr key={line.lineId}>
              <td className={t.sticky}>{line.label}</td>
              {line.cells.map((cell, i) => {
                if (!cell) {
                  return (
                    <td key={months[i]} className={t.dim}>
                      —
                    </td>
                  );
                }
                const over = cell.spent > cell.budgeted;
                return (
                  <td
                    key={months[i]}
                    className={clsx(over && t.over, !cell.created && t.provisional)}
                  >
                    <Tooltip
                      label={`${longMonthLabel(months[i] ?? '')}: ${format.money(cell.spent)} of ${format.money(cell.budgeted)}${cell.created ? '' : ' (defaults; budget not created)'}`}
                    >
                      <span>
                        {format.money(cell.spent)}
                        {over && <span aria-label="over budget"> ▲</span>}
                        {showBudgeted && (
                          <span className={styles.budgeted}> / {format.money(cell.budgeted)}</span>
                        )}
                      </span>
                    </Tooltip>
                  </td>
                );
              })}
              <td>{format.money(avg)}</td>
            </tr>
          );
        })}
      </tbody>
      <tfoot>
        <tr>
          <td className={t.sticky}>Total</td>
          {history.totals.map((tot, i) => (
            <td key={months[i]} className={tot.spent > tot.budgeted ? t.over : undefined}>
              {format.money(tot.spent)}
              {showBudgeted && (
                <span className={styles.budgeted}> / {format.money(tot.budgeted)}</span>
              )}
            </td>
          ))}
          <td>
            {format.money(
              Math.round(
                history.totals.reduce((s, x) => s + x.spent, 0) / Math.max(1, months.length),
              ),
            )}
          </td>
        </tr>
      </tfoot>
    </table>
  );

  return (
    <ReportSection
      title="Budget history"
      subtitle="Spent per monthly budget line. ▲ marks months over budget; italics are months whose budget wasn’t created (defaults shown)."
      chart={<div className={styles.scroll}>{grid(false)}</div>}
      table={grid(true)}
    />
  );
}
