import { clsx } from 'clsx';
import { useMemo } from 'react';
import { computeScenario } from '@/domain/planner/engine';
import type { PlannerScenario } from '@/domain/schema/types';
import { useFormat } from '@/hooks/useFormat';
import t from '@/features/reports/reportTable.module.scss';
import { usePlannerContext } from './usePlannerContext';
import styles from './CompareScenarios.module.scss';

/** Scenarios side by side: what changes if income, deductions or rules change. */
export function CompareScenarios({ scenarios }: { scenarios: PlannerScenario[] }) {
  const format = useFormat();
  const { budgetPerYear } = usePlannerContext();
  const results = useMemo(
    () =>
      scenarios.map((s) => ({
        scenario: s,
        result: { ...computeScenario(s), savings: s.savings ?? 0 },
      })),
    [scenarios],
  );
  const taxNames = [...new Set(results.flatMap((r) => r.result.taxes.map((x) => x.rule.name)))];
  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
  const base = results[0]?.result;

  const row = (
    label: string,
    value: (r: (typeof results)[number]['result']) => number,
    kind: 'money' | 'pct' = 'money',
    strong = false,
  ) => (
    <tr className={clsx(strong && styles.strong)}>
      <td>{label}</td>
      {results.map(({ scenario, result }, i) => {
        const v = value(result);
        const diff = base && i > 0 ? v - value(base) : 0;
        return (
          <td key={scenario.id}>
            {kind === 'money' ? format.money(v) : pct(v)}
            {diff !== 0 && kind === 'money' && (
              <span className={styles.diff}> ({format.money(diff, { sign: 'always' })})</span>
            )}
          </td>
        );
      })}
    </tr>
  );

  return (
    <div className={styles.root}>
      <p className={styles.intro}>Differences are shown against the first scenario.</p>
      <table className={t.table}>
        <thead>
          <tr>
            <th />
            {results.map(({ scenario }) => (
              <th key={scenario.id}>
                {scenario.name} <span className={t.dim}>{scenario.year}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {row('Gross income', (r) => r.gross, 'money', true)}
          {taxNames.map((name) => (
            <tr key={name}>
              <td className={styles.indent}>{name}</td>
              {results.map(({ scenario, result }) => (
                <td key={scenario.id}>
                  {format.money(result.taxes.find((x) => x.rule.name === name)?.amount ?? 0)}
                </td>
              ))}
            </tr>
          ))}
          {row('Total tax', (r) => r.totalTax)}
          {row('Deductions & benefits', (r) => r.pretaxDeductions + r.posttaxDeductions)}
          {row('Take-home per year', (r) => r.takeHome, 'money', true)}
          {row('Take-home per month', (r) => r.monthlyTakeHome, 'money', true)}
          {row('Effective tax rate', (r) => r.effectiveRate, 'pct')}
          {row('Marginal rate', (r) => r.marginalRate, 'pct')}
          {row('Savings (per year)', (r) => r.savings)}
          {row(
            'Left after savings and default budget (per year)',
            (r) => r.takeHome - r.savings - budgetPerYear,
          )}
        </tbody>
      </table>
    </div>
  );
}
