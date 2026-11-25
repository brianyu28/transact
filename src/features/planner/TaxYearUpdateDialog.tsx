import { Button, Checkbox, Group, Modal, Select, Text } from '@mantine/core';
import { useMemo, useState } from 'react';
import {
  planTaxYearUpdate,
  type FigureChange,
  type RuleUpdate,
} from '@/domain/planner/taxYearUpdate';
import { US_TAX_YEARS } from '@/domain/planner/taxYears';
import type { PlannerScenario } from '@/domain/schema/types';
import { useFormat, type Formatters } from '@/hooks/useFormat';
import { tryRun } from '@/store/actions';
import styles from './TaxYearUpdateDialog.module.scss';

const YEARS = [...US_TAX_YEARS]
  .reverse()
  .map((y) => ({ value: String(y.year), label: String(y.year) }));

interface TaxYearUpdateDialogProps {
  scenario: PlannerScenario;
  /** The year to preselect; null when closed. */
  year: number | null;
  onClose: () => void;
}

/** Preview and apply another tax year's published figures to a scenario's template rules. */
export function TaxYearUpdateDialog({ scenario, year, onClose }: TaxYearUpdateDialogProps) {
  return (
    <Modal opened={year !== null} onClose={onClose} title="Update tax rules" size="md">
      {year !== null && <UpdateForm scenario={scenario} initialYear={year} onClose={onClose} />}
    </Modal>
  );
}

function describe(change: FigureChange, u: RuleUpdate, format: Formatters): string {
  const money = (c: number | undefined) => (c === undefined ? 'none' : format.money(c));
  const pct = (r: number | undefined) =>
    r === undefined
      ? 'none'
      : `${(r * 100).toLocaleString(undefined, { maximumFractionDigits: 3 })}%`;
  switch (change.field) {
    case 'deduction':
      return `${u.key === 'federalIncome' ? 'Standard deduction' : 'Deduction'} ${money(change.from)} → ${money(change.to)}`;
    case 'cap':
      return `Cap ${money(change.from)} → ${money(change.to)}`;
    case 'threshold':
      return `Threshold ${money(change.from)} → ${money(change.to)}`;
    case 'rate':
      return `Rate ${pct(change.from)} → ${pct(change.to)}`;
    case 'baseFactor':
      return `Percent of earnings taxed ${pct(change.from ?? 1)} → ${pct(change.to ?? 1)}`;
    case 'brackets':
      return 'New brackets';
    case 'other':
      return 'Base and other settings';
  }
}

function UpdateForm({
  scenario,
  initialYear,
  onClose,
}: {
  scenario: PlannerScenario;
  initialYear: number;
  onClose: () => void;
}) {
  const format = useFormat();
  const [year, setYear] = useState(initialYear);
  const [replace, setReplace] = useState<ReadonlySet<string>>(new Set());
  const plan = useMemo(() => planTaxYearUpdate(scenario.taxes, year), [scenario.taxes, year]);
  const updates = plan?.updates ?? [];
  const changing = updates.filter((u) => u.status === 'update');
  const edited = updates.filter((u) => u.status === 'edited' && u.changes.length > 0);
  const unchanged = updates.filter(
    (u) => u.status === 'unchanged' || (u.status === 'edited' && u.changes.length === 0),
  );
  const summary = (u: RuleUpdate) => u.changes.map((c) => describe(c, u, format)).join(' · ');

  const apply = () => {
    if (tryRun('updateScenarioTaxYear', { id: scenario.id, year, replace: [...replace] }))
      onClose();
  };

  return (
    <div className={styles.form}>
      <Select
        label="Tax year"
        data={YEARS}
        value={String(year)}
        allowDeselect={false}
        onChange={(v) => {
          if (v) setYear(Number(v));
        }}
      />
      {updates.length === 0 ? (
        <Text size="sm" c="dimmed">
          This scenario has no rules from the US tax template to update.
        </Text>
      ) : (
        <>
          {changing.length > 0 && (
            <section>
              <h4 className={styles.heading}>Updated to {year} figures</h4>
              {changing.map((u) => (
                <div key={u.ruleId} className={styles.row}>
                  <span className={styles.name}>{u.name}</span>
                  <span className={styles.changes}>{summary(u)}</span>
                </div>
              ))}
            </section>
          )}
          {edited.length > 0 && (
            <section>
              <h4 className={styles.heading}>Rules you’ve edited</h4>
              {edited.map((u) => (
                <Checkbox
                  key={u.ruleId}
                  className={styles.row}
                  label={`Replace ${u.name} with ${String(year)} figures`}
                  description={summary(u)}
                  checked={replace.has(u.ruleId)}
                  onChange={(e) => {
                    const next = new Set(replace);
                    if (e.currentTarget.checked) next.add(u.ruleId);
                    else next.delete(u.ruleId);
                    setReplace(next);
                  }}
                />
              ))}
            </section>
          )}
          {unchanged.length > 0 && (
            <Text size="xs" c="dimmed">
              Already match {year}: {unchanged.map((u) => u.name).join(', ')}.
            </Text>
          )}
        </>
      )}
      <Text size="xs" c="dimmed">
        Other rules, like state tax, aren’t changed. The scenario’s year becomes {year}.
      </Text>
      <Group justify="flex-end" gap="xs">
        <Button variant="default" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={apply}>Update to {year}</Button>
      </Group>
    </div>
  );
}
