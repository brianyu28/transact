import { Alert, Anchor, Button } from '@mantine/core';
import { IconCalendarPlus } from '@tabler/icons-react';
import { clsx } from 'clsx';
import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { StatTile } from '@/components/StatTile/StatTile';
import { periodElapsed, periodKeyFor } from '@/domain/budgets/periods';
import type { BudgetView } from '@/domain/budgets/views';
import type { BudgetTier } from '@/domain/schema/types';
import { BudgetBar } from '@/features/budgets/BudgetBar';
import { BudgetTable } from '@/features/budgets/BudgetTable';
import { CreatePeriodDialog } from '@/features/budgets/CreatePeriodDialog';
import { useBudgetView, useCustomBudgetViews } from '@/features/budgets/useBudgetData';
import { registerActions } from '@/features/transactions/registerStore';
import { useFormat } from '@/hooks/useFormat';
import { dateParts, daysInMonth, today } from '@/lib/date';
import { pluralize } from '@/lib/format';
import { useDocStore } from '@/store/docStore';
import styles from './HomePage.module.scss';

/** Where the current budgets stand: this month, this year, and active custom budgets. */
export function HomePage() {
  const startMonth = useDocStore((s) => s.doc?.settings.budgetYearStartMonth ?? 1);
  const hasTemplate = useDocStore(
    (s) => Object.keys(s.doc?.budgets.template.lines ?? {}).length > 0,
  );
  const now = today();
  const month = useBudgetView('monthly', periodKeyFor('monthly', now, startMonth));
  const year = useBudgetView('annual', periodKeyFor('annual', now, startMonth));
  const custom = useCustomBudgetViews();
  const format = useFormat();
  const [creating, setCreating] = useState<BudgetTier | null>(null);
  const [, navigate] = useLocation();
  if (!month || !year) return null;

  const { day, year: y, month: m } = dateParts(now);
  const spentThisMonth = month.totals.spent + month.unbudgeted;
  // Active: not archived and, if it has a date range, today falls within it.
  const activeCustom = custom.filter((c) => {
    if (c.budget.archived) return false;
    const range = c.budget.dateRange;
    if (!range) return true;
    return (!range.start || range.start <= now) && (!range.end || range.end >= now);
  });

  const showUncategorized = () => {
    registerActions.setQuery('is:uncategorized date:this-month');
    navigate('/transactions');
  };

  if (!hasTemplate) {
    return (
      <div className={styles.root}>
        <h2 className={styles.title}>{month.label}</h2>
        <p className={styles.empty}>
          You haven’t set up a budget yet. Start with your default budget: the monthly and annual
          amounts each new period begins with.
        </p>
        <Button component={Link} href="/budgets/defaults">
          Set up your budget
        </Button>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <div>
          <h2 className={styles.title}>{month.label}</h2>
          <p className={styles.subtitle}>
            Day {day} of {daysInMonth(y, m)} · {Math.round(month.elapsed * 100)}% through the month
          </p>
        </div>
        <Anchor component={Link} href="/budgets" size="sm">
          All budgets
        </Anchor>
      </header>

      <CreatePrompt
        view={month}
        onCreate={() => {
          setCreating('monthly');
        }}
      />
      <CreatePrompt
        view={year}
        onCreate={() => {
          setCreating('annual');
        }}
      />

      <div className={styles.tiles}>
        <StatTile
          label="Left this month"
          value={format.money(month.totals.remaining)}
          delta={{
            text: `of ${format.money(month.totals.budgeted)} budgeted`,
            positive: month.totals.remaining >= 0,
          }}
        />
        <StatTile label="Spent this month" value={format.money(spentThisMonth)} />
        <StatTile label="Income this month" value={format.money(month.income)} />
        {month.uncategorizedCount > 0 && (
          <button type="button" className={styles.tileButton} onClick={showUncategorized}>
            <StatTile
              label="Uncategorized"
              value={pluralize(month.uncategorizedCount, 'transaction')}
            />
          </button>
        )}
      </div>

      <section className={styles.section}>
        <h3 className={styles.heading}>Monthly</h3>
        <BudgetTable view={month} compact editable />
      </section>

      {year.lines.length > 0 && (
        <section className={styles.section}>
          <h3 className={styles.heading}>
            Annual{' '}
            <span className={styles.headingNote}>
              {year.label} · {Math.round(year.elapsed * 100)}% through the year
            </span>
          </h3>
          <BudgetTable view={year} compact editable />
        </section>
      )}

      {activeCustom.length > 0 && (
        <section className={styles.section}>
          <h3 className={styles.heading}>Custom</h3>
          {activeCustom.map((c) => {
            const elapsed = c.budget.dateRange ? periodElapsed(c.bounds, now) : undefined;
            const remaining = c.total - c.spent;
            return (
              <Link key={c.budget.id} href="/budgets/custom" className={styles.customRow}>
                <span className={styles.customName}>{c.budget.name}</span>
                <span className={styles.num}>
                  {format.money(c.spent)}{' '}
                  <span className={styles.dim}>of {format.money(c.total)}</span>
                </span>
                <span className={clsx(styles.num, remaining < 0 && styles.negative)}>
                  {remaining < 0
                    ? `${format.money(-remaining)} over`
                    : `${format.money(remaining)} left`}
                </span>
                <BudgetBar budgeted={c.total} spent={c.spent} elapsed={elapsed} />
              </Link>
            );
          })}
        </section>
      )}

      <CreatePeriodDialog
        cadence={creating ?? 'monthly'}
        periodKey={creating === 'monthly' ? month.key : creating === 'annual' ? year.key : null}
        label={creating === 'annual' ? year.label : month.label}
        onClose={() => {
          setCreating(null);
        }}
      />
    </div>
  );
}

function CreatePrompt({ view, onCreate }: { view: BudgetView; onCreate: () => void }) {
  if (view.period || view.lines.length === 0) return null;
  return (
    <Alert variant="light" icon={<IconCalendarPlus size={16} />} className={styles.prompt}>
      <span className={styles.promptBody}>
        <span>
          The {view.label} budget hasn’t been created yet. Amounts below are your defaults.
        </span>
        <Button size="compact-sm" onClick={onCreate}>
          Create {view.label} budget
        </Button>
      </span>
    </Alert>
  );
}
