import { Alert } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { clsx } from 'clsx';
import type { PlannerResult } from '@/domain/planner/engine';
import { useFormat } from '@/hooks/useFormat';
import { seriesColor } from '@/features/reports/useReportMonths';
import styles from './ScenarioSummary.module.scss';

interface ScenarioSummaryProps {
  result: PlannerResult;
  /** Yearly total of the default budget (12 × monthly + annual). */
  budgetPerYear: number;
  /** Actual income over the last 12 months, for comparison. */
  actualIncome: number;
}

/** Gross → taxes → deductions → take-home, and how it compares with the budget. */
export function ScenarioSummary({ result, budgetPerYear, actualIncome }: ScenarioSummaryProps) {
  const format = useFormat();
  const deductions = result.pretaxDeductions + result.posttaxDeductions;
  const leftover = result.takeHome - budgetPerYear;
  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

  // Where gross income goes (one whole, split into parts): ≤4 categorical slots.
  const budgeted = Math.max(0, Math.min(budgetPerYear, result.takeHome));
  const parts = [
    { key: 'taxes', label: 'Taxes', value: result.totalTax, color: seriesColor(1) },
    { key: 'deductions', label: 'Deductions & benefits', value: deductions, color: seriesColor(2) },
    { key: 'budget', label: 'Budgeted spending', value: budgeted, color: seriesColor(3) },
    {
      key: 'left',
      label: 'Left over',
      value: Math.max(0, result.takeHome - budgeted),
      color: seriesColor(4),
    },
  ].filter((p) => p.value > 0);
  const total = parts.reduce((s, p) => s + p.value, 0);

  return (
    <aside className={styles.root}>
      {result.error && (
        <Alert color="red" variant="light" icon={<IconAlertTriangle size={16} />} mb="sm">
          {result.error}
        </Alert>
      )}
      <div className={styles.hero}>
        <span className={styles.label}>Take-home pay</span>
        <span className={styles.big}>{format.money(result.monthlyTakeHome)}</span>
        <span className={styles.sub}>
          a month · {format.money(result.takeHome)} a year ·{' '}
          {format.money(Math.round(result.takeHome / 26))} every two weeks
        </span>
      </div>

      {total > 0 && (
        <div className={styles.split}>
          <div className={styles.bar} role="img" aria-label="Where income goes">
            {parts.map((p) => (
              <span
                key={p.key}
                style={{ flexGrow: p.value, background: p.color }}
                title={`${p.label}: ${format.money(p.value)}`}
              />
            ))}
          </div>
          <ul className={styles.legend}>
            {parts.map((p) => (
              <li key={p.key}>
                <span className={styles.swatch} style={{ background: p.color }} />
                <span>{p.label}</span>
                <span className={styles.legendValue}>
                  {format.money(p.value)} <span className={styles.dim}>{pct(p.value / total)}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <dl className={styles.waterfall}>
        <dt>Gross income</dt>
        <dd>{format.money(result.gross)}</dd>
        {result.taxes.map((t) => (
          <div key={t.rule.id} className={styles.indent}>
            <dt>{t.rule.name}</dt>
            <dd className={t.amount === 0 ? styles.dim : undefined}>
              {t.amount === 0 ? '—' : `−${format.money(t.amount)}`}
            </dd>
          </div>
        ))}
        {result.pretaxDeductions > 0 && (
          <div className={styles.indent}>
            <dt>Pre-tax deductions</dt>
            <dd>−{format.money(result.pretaxDeductions)}</dd>
          </div>
        )}
        {result.posttaxDeductions > 0 && (
          <div className={styles.indent}>
            <dt>After-tax deductions</dt>
            <dd>−{format.money(result.posttaxDeductions)}</dd>
          </div>
        )}
        <dt className={styles.total}>Take-home</dt>
        <dd className={styles.total}>{format.money(result.takeHome)}</dd>
      </dl>

      <dl className={styles.stats}>
        <dt>Effective tax rate</dt>
        <dd>{pct(result.effectiveRate)}</dd>
        <dt>Marginal rate</dt>
        <dd>{pct(result.marginalRate)}</dd>
        <dt>Default budget</dt>
        <dd>{format.money(budgetPerYear)} / yr</dd>
        <dt>{leftover >= 0 ? 'Left after budget' : 'Budget shortfall'}</dt>
        <dd className={clsx(leftover >= 0 ? styles.good : styles.bad)}>
          {format.money(Math.abs(leftover))} / yr ·{' '}
          {format.money(Math.round(Math.abs(leftover) / 12))} / mo
        </dd>
        <dt>Actual income, last 12 months</dt>
        <dd className={styles.dim}>{format.money(actualIncome)}</dd>
      </dl>
    </aside>
  );
}
