import { Alert, SegmentedControl } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { clsx } from 'clsx';
import type { PlannerResult } from '@/domain/planner/engine';
import { useFormat } from '@/hooks/useFormat';
import { seriesColor } from '@/features/reports/useReportPeriod';
import { prefsStore, usePrefs } from '@/store/prefsStore';
import styles from './ScenarioSummary.module.scss';

interface ScenarioSummaryProps {
  result: PlannerResult;
  /** Yearly amount set aside from take-home pay. */
  savings: number;
  /** Yearly total of the default budget (12 × monthly + annual). */
  budgetPerYear: number;
  /** Actual income over the last 12 months, for comparison (averaged in the month view). */
  actualIncome: number;
}

/**
 * Gross → taxes → deductions → take-home, and how it compares with the budget, per month
 * or per year (a device preference). Amounts are yearly; the month view divides by 12.
 */
export function ScenarioSummary({
  result,
  savings,
  budgetPerYear,
  actualIncome,
}: ScenarioSummaryProps) {
  const format = useFormat();
  const per = usePrefs((s) => s.plannerPeriod);
  const monthly = per === 'month';
  /** A yearly amount in the chosen period. */
  const money = (yearly: number) => format.money(monthly ? Math.round(yearly / 12) : yearly);
  const unit = monthly ? '/ mo' : '/ yr';
  const deductions = result.pretaxDeductions + result.posttaxDeductions;
  const leftover = result.takeHome - savings - budgetPerYear;
  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

  // Where gross income goes (one whole, split into parts): ≤5 categorical slots.
  const saved = Math.max(0, Math.min(savings, result.takeHome));
  const budgeted = Math.max(0, Math.min(budgetPerYear, result.takeHome - saved));
  const parts = [
    { key: 'taxes', label: 'Taxes', value: result.totalTax, color: seriesColor(1) },
    { key: 'deductions', label: 'Deductions & benefits', value: deductions, color: seriesColor(2) },
    { key: 'savings', label: 'Savings', value: saved, color: seriesColor(5) },
    { key: 'budget', label: 'Budgeted spending', value: budgeted, color: seriesColor(3) },
    {
      key: 'left',
      label: 'Left over',
      value: Math.max(0, result.takeHome - saved - budgeted),
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
      <div className={styles.top}>
        <div className={styles.hero}>
          <span className={styles.label}>Take-home pay</span>
          <span className={styles.big}>
            {format.money(monthly ? result.monthlyTakeHome : result.takeHome)}
          </span>
          <span className={styles.sub}>
            {monthly
              ? `a month · ${format.money(result.takeHome)} a year`
              : `a year · ${format.money(result.monthlyTakeHome)} a month`}
          </span>
        </div>
        <SegmentedControl
          size="xs"
          aria-label="Show amounts per"
          value={per}
          data={[
            { value: 'month', label: 'Month' },
            { value: 'year', label: 'Year' },
          ]}
          onChange={(v) => {
            prefsStore.getState().setPref('plannerPeriod', v === 'year' ? 'year' : 'month');
          }}
        />
      </div>

      {total > 0 && (
        <div className={styles.split}>
          <div className={styles.bar} role="img" aria-label="Where income goes">
            {parts.map((p) => (
              <span
                key={p.key}
                style={{ flexGrow: p.value, background: p.color }}
                title={`${p.label}: ${money(p.value)}`}
              />
            ))}
          </div>
          <ul className={styles.legend}>
            {parts.map((p) => (
              <li key={p.key}>
                <span className={styles.swatch} style={{ background: p.color }} />
                <span>{p.label}</span>
                <span className={styles.legendValue}>
                  {money(p.value)} <span className={styles.dim}>{pct(p.value / total)}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <dl className={styles.waterfall}>
        <dt>Gross income</dt>
        <dd>{money(result.gross)}</dd>
        {result.taxes.map((t) => (
          <div key={t.rule.id} className={styles.indent}>
            <dt>{t.rule.name}</dt>
            <dd className={t.amount === 0 ? styles.dim : undefined}>
              {t.amount === 0 ? '—' : `−${money(t.amount)}`}
            </dd>
          </div>
        ))}
        {result.pretaxDeductions > 0 && (
          <div className={styles.indent}>
            <dt>Pre-tax deductions</dt>
            <dd>−{money(result.pretaxDeductions)}</dd>
          </div>
        )}
        {result.posttaxDeductions > 0 && (
          <div className={styles.indent}>
            <dt>After-tax deductions</dt>
            <dd>−{money(result.posttaxDeductions)}</dd>
          </div>
        )}
        <dt className={styles.total}>Take-home</dt>
        <dd className={styles.total}>{money(result.takeHome)}</dd>
      </dl>

      <dl className={styles.stats}>
        <dt>Effective tax rate</dt>
        <dd>{pct(result.effectiveRate)}</dd>
        <dt>Marginal rate</dt>
        <dd>{pct(result.marginalRate)}</dd>
        {savings > 0 && (
          <>
            <dt>Savings</dt>
            <dd>
              {money(savings)} {unit}
            </dd>
          </>
        )}
        <dt>Default budget</dt>
        <dd>
          {money(budgetPerYear)} {unit}
        </dd>
        <dt>{leftover >= 0 ? 'Left after budget' : 'Budget shortfall'}</dt>
        <dd className={clsx(leftover >= 0 ? styles.good : styles.bad)}>
          {money(Math.abs(leftover))} {unit}
        </dd>
        <dt>{monthly ? 'Actual income, monthly average' : 'Actual income, last 12 months'}</dt>
        <dd className={styles.dim}>
          {money(actualIncome)} {unit}
        </dd>
      </dl>
    </aside>
  );
}
