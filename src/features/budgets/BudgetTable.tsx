import { Tooltip } from '@mantine/core';
import { clsx } from 'clsx';
import { MoneyInput } from '@/components/MoneyInput/MoneyInput';
import { NoteButton } from '@/components/NoteButton/NoteButton';
import type { BudgetView, LineView } from '@/domain/budgets/views';
import { useFormat } from '@/hooks/useFormat';
import { tryRun } from '@/store/actions';
import { useLocation } from 'wouter';
import { BudgetBar } from './BudgetBar';
import { filterRegisterToBudget } from './budgetLinks';
import { budgetStatus } from './budgetStatus';
import styles from './BudgetTable.module.scss';

interface BudgetTableProps {
  view: BudgetView;
  /** Allow editing budgeted amounts (only for created periods). */
  editable?: boolean;
  /** Compact: hides the rollover detail (Home screen). */
  compact?: boolean;
}

/** Lines with budgeted, spent, remaining and a progress bar with a pace marker. */
export function BudgetTable({ view, editable = false, compact = false }: BudgetTableProps) {
  const format = useFormat();
  const [, navigate] = useLocation();
  const canEdit = editable && view.period !== undefined;
  const { totals } = view;

  return (
    <div
      className={clsx(styles.table, compact && styles.compact)}
      role="table"
      aria-label={`${view.label} budget`}
    >
      <div className={clsx(styles.row, styles.head)} role="row">
        <span role="columnheader">Budget</span>
        <span role="columnheader" className={styles.num}>
          Budgeted
        </span>
        <span role="columnheader" className={styles.num}>
          Spent
        </span>
        <span role="columnheader" className={styles.num}>
          Remaining
        </span>
        <span role="columnheader" className={styles.barHead}>
          {view.elapsed > 0 && view.elapsed < 1 ? `${Math.round(view.elapsed * 100)}% through` : ''}
        </span>
      </div>
      {view.lines.length === 0 && (
        <div className={styles.empty}>No budget lines yet. Add some under Defaults.</div>
      )}
      {view.lines.map((line) => (
        <LineRow key={line.lineId} line={line} view={view} canEdit={canEdit} compact={compact} />
      ))}
      {view.lines.length > 0 && (
        <div className={clsx(styles.row, styles.total)} role="row">
          <span role="cell">Total</span>
          <span role="cell" className={styles.num}>
            {format.money(totals.budgeted)}
          </span>
          <span role="cell" className={styles.num}>
            {format.money(totals.spent)}
          </span>
          <span role="cell" className={clsx(styles.num, totals.remaining < 0 && styles.negative)}>
            {format.money(totals.remaining)}
          </span>
          <span role="cell">
            <BudgetBar budgeted={totals.budgeted} spent={totals.spent} elapsed={view.elapsed} />
          </span>
        </div>
      )}
      {view.unbudgeted !== 0 && (
        <div className={clsx(styles.row, styles.extra)} role="row">
          <Tooltip label="Spending that no budget line covers. Click to see it.">
            <span role="cell">
              <button
                type="button"
                className={styles.labelLink}
                onClick={() => {
                  filterRegisterToBudget('unbudgeted', view.bounds);
                  navigate('/transactions');
                }}
              >
                Unbudgeted spending
              </button>
            </span>
          </Tooltip>
          <span role="cell" />
          <span role="cell" className={styles.num}>
            {format.money(view.unbudgeted)}
          </span>
          <span role="cell" />
          <span role="cell" />
        </div>
      )}
    </div>
  );
}

function LineRow({
  line,
  view,
  canEdit,
  compact,
}: {
  line: LineView;
  view: BudgetView;
  canEdit: boolean;
  compact: boolean;
}) {
  const format = useFormat();
  const status = budgetStatus(line.budgeted, line.spent, view.elapsed);
  const statusText =
    status === 'over' ? 'Over budget' : status === 'ahead' ? 'Ahead of pace' : 'On track';
  const periodId = view.period?.id;
  const [, navigate] = useLocation();
  return (
    <div className={clsx(styles.row, 'tx-note-row')} role="row">
      <span role="cell" className={styles.label}>
        <button
          type="button"
          className={styles.labelLink}
          title={`Show ${line.label} transactions`}
          onClick={() => {
            filterRegisterToBudget(line.label, view.bounds);
            navigate('/transactions');
          }}
        >
          {line.label}
        </button>
        {canEdit && periodId && !compact && (
          <NoteButton
            note={line.note}
            subject={line.label}
            onSave={(note) => {
              tryRun('setPeriodLine', {
                periodId,
                templateLineId: line.lineId,
                changes: { note },
              });
            }}
          />
        )}
      </span>
      <span role="cell" className={styles.num}>
        {canEdit && periodId ? (
          <span className={styles.budgeted}>
            <MoneyInput
              size="xs"
              variant="unstyled"
              aria-label={`Budget for ${line.label}`}
              value={line.base}
              onCommit={(base) => {
                tryRun('setPeriodLine', {
                  periodId,
                  templateLineId: line.lineId,
                  changes: { base },
                });
              }}
              className={styles.inlineInput}
            />
            {line.rollover !== 0 && !compact && (
              <Tooltip label="Rolled over from the previous period">
                <span className={clsx(styles.rollover, line.rollover < 0 && styles.negative)}>
                  {format.money(line.rollover, { sign: 'always' })}
                </span>
              </Tooltip>
            )}
          </span>
        ) : (
          format.money(line.budgeted)
        )}
      </span>
      <span role="cell" className={styles.num}>
        {format.money(line.spent)}
      </span>
      <span role="cell" className={clsx(styles.num, line.remaining < 0 && styles.negative)}>
        {line.remaining < 0
          ? `${format.money(-line.remaining)} over`
          : format.money(line.remaining)}
      </span>
      <span role="cell" className={styles.barCell} title={statusText}>
        <BudgetBar budgeted={line.budgeted} spent={line.spent} elapsed={view.elapsed} />
        <span className={styles.srOnly}>{statusText}</span>
      </span>
    </div>
  );
}
