import { clsx } from 'clsx';
import type { ComponentType } from 'react';
import { Link, useParams } from 'wouter';
import { CustomBudgets } from './CustomBudgets';
import { DefaultsEditor } from './DefaultsEditor';
import { PeriodBudget } from './PeriodBudget';
import styles from './BudgetsPage.module.scss';

const TABS: readonly { id: string; title: string; component: ComponentType }[] = [
  { id: 'monthly', title: 'Monthly', component: () => <PeriodBudget cadence="monthly" /> },
  { id: 'annual', title: 'Annual', component: () => <PeriodBudget cadence="annual" /> },
  { id: 'custom', title: 'Custom', component: CustomBudgets },
  { id: 'defaults', title: 'Defaults', component: DefaultsEditor },
];

export function BudgetsPage() {
  const { tab = 'monthly' } = useParams<{ tab?: string }>();
  const current = TABS.find((t) => t.id === tab) ?? TABS[0];
  if (!current) return null;
  const Tab = current.component;
  return (
    <div className={styles.root}>
      <nav className={styles.tabs} aria-label="Budget views">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={`/budgets/${t.id}`}
            className={clsx(styles.tab, t.id === current.id && styles.active)}
            aria-current={t.id === current.id ? 'page' : undefined}
          >
            {t.title}
          </Link>
        ))}
      </nav>
      <div className={styles.content}>
        <Tab key={current.id} />
      </div>
    </div>
  );
}
