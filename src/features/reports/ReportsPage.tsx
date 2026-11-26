import { clsx } from 'clsx';
import { useState, type ComponentType } from 'react';
import { Link, useParams } from 'wouter';
import { presetRange, REPORT_RANGES } from '@/domain/aggregates/sampling';
import { RangeControl } from '@/features/accounts/RangeControl';
import type { ReportPeriod } from '@/domain/reports/reports';
import { today } from '@/lib/date';
import { BudgetHistoryReport } from './BudgetHistoryReport';
import { CategoryReport } from './CategoryReport';
import { IncomeReport } from './IncomeReport';
import { NetWorthReport } from './NetWorthReport';
import { useReportPeriod } from './useReportPeriod';
import styles from './ReportsPage.module.scss';

const TABS: readonly {
  id: string;
  title: string;
  component: ComponentType<{ period: ReportPeriod }>;
}[] = [
  { id: 'categories', title: 'Categories', component: CategoryReport },
  { id: 'income', title: 'Income', component: IncomeReport },
  { id: 'budgets', title: 'Budgets', component: BudgetHistoryReport },
  { id: 'net-worth', title: 'Net worth', component: NetWorthReport },
];

export function ReportsPage() {
  const { tab = 'categories' } = useParams<{ tab?: string }>();
  // Unknown tabs (including the old "spending" one, now part of Categories) show the first.
  const current = TABS.find((x) => x.id === tab) ?? TABS[0];
  // The range is shared across report tabs.
  const [range, setRange] = useState(() => presetRange('ytd', today()));
  const period = useReportPeriod(range);
  if (!current) return null;
  const Report = current.component;
  return (
    <div className={styles.root}>
      <div className={styles.bar}>
        <nav className={styles.tabs} aria-label="Reports">
          {TABS.map((x) => (
            <Link
              key={x.id}
              href={`/reports/${x.id}`}
              className={clsx(styles.tab, x.id === current.id && styles.active)}
              aria-current={x.id === current.id ? 'page' : undefined}
            >
              {x.title}
            </Link>
          ))}
        </nav>
        <RangeControl value={range} onChange={setRange} options={REPORT_RANGES} span={period} />
      </div>
      <div className={styles.content}>
        <Report period={period} />
      </div>
    </div>
  );
}
