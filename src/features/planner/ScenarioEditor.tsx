import {
  ActionIcon,
  Button,
  Checkbox,
  MultiSelect,
  Select,
  TextInput,
  Tooltip,
} from '@mantine/core';
import { IconPencil, IconPlus, IconTrash } from '@tabler/icons-react';
import { clsx } from 'clsx';
import { useState } from 'react';
import { MoneyInput } from '@/components/MoneyInput/MoneyInput';
import { TAX_BASE_LABELS, type PlannerResult, type TaxBase } from '@/domain/planner/engine';
import type { PlannerScenario, TaxRule } from '@/domain/schema/types';
import { useFormat } from '@/hooks/useFormat';
import { newId } from '@/lib/id';
import { tryRun } from '@/store/actions';
import { TaxRuleDialog } from './TaxRuleDialog';
import styles from './ScenarioEditor.module.scss';

const KINDS = [
  { value: 'w2', label: 'W-2 salary' },
  { value: '1099', label: '1099 / self-employed' },
  { value: 'other', label: 'Other' },
];
const BASE_OPTIONS = Object.entries(TAX_BASE_LABELS).map(([value, label]) => ({ value, label }));

function rateSummary(rule: TaxRule): string {
  const pct = (r: number) =>
    `${(r * 100).toLocaleString(undefined, { maximumFractionDigits: 3 })}%`;
  if (rule.schedule.kind === 'flat') return pct(rule.schedule.rate);
  const rates = rule.schedule.brackets.map((b) => b.rate);
  return `${pct(Math.min(...rates))}–${pct(Math.max(...rates))} (${String(rates.length)} brackets)`;
}

/** Income, deductions and tax rules for one scenario; every change saves (and can be undone). */
export function ScenarioEditor({
  scenario,
  result,
}: {
  scenario: PlannerScenario;
  result: PlannerResult;
}) {
  const format = useFormat();
  const [editingRule, setEditingRule] = useState<TaxRule | null>(null);
  const save = (
    changes: Partial<
      Pick<PlannerScenario, 'people' | 'incomes' | 'deductions' | 'taxes' | 'savings'>
    >,
  ) => {
    tryRun('updateScenario', { id: scenario.id, changes });
  };
  const { incomes, deductions, taxes } = scenario;
  const people = scenario.people ?? [];
  const hasPeople = people.length > 0;
  const personOptions = [
    { value: '', label: 'Household' },
    ...people.map((p) => ({ value: p.id, label: p.name })),
  ];
  const personName = (id: string) => people.find((p) => p.id === id)?.name ?? 'Unassigned';
  const personSelect = (
    value: string | undefined,
    onChange: (person: string | undefined) => void,
  ) => (
    <Select
      size="xs"
      variant="unstyled"
      aria-label="Person"
      data={personOptions}
      value={value ?? ''}
      allowDeselect={false}
      onChange={(v) => {
        onChange(v ? v : undefined);
      }}
    />
  );
  /** Sets or clears an item's person without storing an empty value. */
  const withPerson = <T extends { person?: string | undefined }>(
    item: T,
    person: string | undefined,
  ): T => {
    const next = { ...item };
    if (person) next.person = person;
    else Reflect.deleteProperty(next, 'person');
    return next;
  };

  return (
    <div className={styles.root}>
      <section>
        <h3 className={styles.heading}>People</h3>
        <div className={styles.people}>
          {!hasPeople && (
            <span className={styles.dim}>
              One earner. Add people to plan two incomes (e.g. a married couple).
            </span>
          )}
          {people.map((p, i) => (
            <span key={p.id} className={styles.person}>
              <TextInput
                size="xs"
                aria-label="Person name"
                defaultValue={p.name}
                w={130}
                onBlur={(e) => {
                  const name = e.currentTarget.value.trim();
                  if (name && name !== p.name)
                    save({ people: people.map((x, j) => (j === i ? { ...x, name } : x)) });
                }}
              />
              <ActionIcon
                color="gray"
                aria-label={`Remove ${p.name}`}
                onClick={() => {
                  save({ people: people.filter((x) => x.id !== p.id) });
                }}
              >
                <IconTrash size={14} />
              </ActionIcon>
            </span>
          ))}
          <Button
            size="xs"
            variant="subtle"
            leftSection={<IconPlus size={14} />}
            onClick={() => {
              const person = {
                id: newId('plannerItem'),
                name: `Person ${String(people.length + 1)}`,
              };
              // Adding the first person: existing incomes become theirs.
              if (!hasPeople) {
                save({
                  people: [person],
                  incomes: incomes.map((x) => withPerson(x, person.id)),
                });
              } else {
                save({ people: [...people, person] });
              }
            }}
          >
            Add person
          </Button>
        </div>
        {hasPeople && (
          <p className={styles.note}>
            Taxes marked per person (Social Security, Medicare, self-employment) are calculated for
            each person’s own income and deductions, with caps applied per person.
          </p>
        )}
      </section>

      <section>
        <h3 className={styles.heading}>Income</h3>
        <div
          className={clsx(
            styles.row,
            styles.incomeRow,
            hasPeople && styles.withPerson,
            styles.head,
          )}
        >
          <span>Source</span>
          {hasPeople && <span>Person</span>}
          <span>Type</span>
          <span className={styles.num}>Per year</span>
          <span className={styles.num}>Per month</span>
          <span />
        </div>
        {incomes.map((income, i) => (
          <div
            key={income.id}
            className={clsx(styles.row, styles.incomeRow, hasPeople && styles.withPerson)}
          >
            <TextInput
              size="xs"
              variant="unstyled"
              aria-label="Income name"
              defaultValue={income.name}
              onBlur={(e) => {
                const name = e.currentTarget.value.trim();
                if (name && name !== income.name)
                  save({ incomes: incomes.map((x, j) => (j === i ? { ...x, name } : x)) });
              }}
            />
            {hasPeople &&
              personSelect(income.person, (person) => {
                save({ incomes: incomes.map((x, j) => (j === i ? withPerson(x, person) : x)) });
              })}
            <Select
              size="xs"
              variant="unstyled"
              aria-label="Income type"
              data={KINDS}
              value={income.kind}
              allowDeselect={false}
              onChange={(v) => {
                if (v)
                  save({
                    incomes: incomes.map((x, j) =>
                      j === i ? { ...x, kind: v as typeof x.kind } : x,
                    ),
                  });
              }}
            />
            <MoneyInput
              size="xs"
              variant="unstyled"
              aria-label={`${income.name} per year`}
              value={income.annual}
              onCommit={(annual) => {
                save({ incomes: incomes.map((x, j) => (j === i ? { ...x, annual } : x)) });
              }}
            />
            <span className={clsx(styles.num, styles.dim)}>
              {format.money(Math.round(income.annual / 12))}
            </span>
            <ActionIcon
              color="gray"
              aria-label={`Remove ${income.name}`}
              onClick={() => {
                save({ incomes: incomes.filter((_, j) => j !== i) });
              }}
            >
              <IconTrash size={14} />
            </ActionIcon>
          </div>
        ))}
        <Button
          size="xs"
          variant="subtle"
          leftSection={<IconPlus size={14} />}
          onClick={() => {
            save({
              incomes: [
                ...incomes,
                { id: newId('plannerItem'), name: 'Income', kind: 'w2', annual: 0 },
              ],
            });
          }}
        >
          Add income
        </Button>
      </section>

      <section>
        <h3 className={styles.heading}>Deductions & benefits</h3>
        <div
          className={clsx(
            styles.row,
            styles.deductionRow,
            hasPeople && styles.withPerson,
            styles.head,
          )}
        >
          <span>Name</span>
          {hasPeople && <span>Person</span>}
          <span className={styles.num}>Per year</span>
          <span>Pre-tax</span>
          <span>Reduces</span>
          <span />
        </div>
        {deductions.map((d, i) => (
          <div
            key={d.id}
            className={clsx(styles.row, styles.deductionRow, hasPeople && styles.withPerson)}
          >
            <TextInput
              size="xs"
              variant="unstyled"
              aria-label="Deduction name"
              defaultValue={d.name}
              onBlur={(e) => {
                const name = e.currentTarget.value.trim();
                if (name && name !== d.name)
                  save({ deductions: deductions.map((x, j) => (j === i ? { ...x, name } : x)) });
              }}
            />
            {hasPeople &&
              personSelect(d.person, (person) => {
                save({
                  deductions: deductions.map((x, j) => (j === i ? withPerson(x, person) : x)),
                });
              })}
            <MoneyInput
              size="xs"
              variant="unstyled"
              aria-label={`${d.name} per year`}
              value={d.annual}
              onCommit={(annual) => {
                save({ deductions: deductions.map((x, j) => (j === i ? { ...x, annual } : x)) });
              }}
            />
            <Checkbox
              size="xs"
              aria-label="Pre-tax"
              checked={d.pretax}
              onChange={(e) => {
                const pretax = e.currentTarget.checked;
                save({
                  deductions: deductions.map((x, j) =>
                    j === i
                      ? {
                          ...x,
                          pretax,
                          reduces: pretax ? (x.reduces.length ? x.reduces : ['taxableIncome']) : [],
                        }
                      : x,
                  ),
                });
              }}
            />
            {d.pretax ? (
              <MultiSelect
                size="xs"
                variant="unstyled"
                aria-label="Reduces"
                data={BASE_OPTIONS}
                value={d.reduces}
                onChange={(v) => {
                  save({
                    deductions: deductions.map((x, j) =>
                      j === i ? { ...x, reduces: v as TaxBase[] } : x,
                    ),
                  });
                }}
              />
            ) : (
              <span className={styles.dim}>Taken from take-home pay</span>
            )}
            <ActionIcon
              color="gray"
              aria-label={`Remove ${d.name}`}
              onClick={() => {
                save({ deductions: deductions.filter((_, j) => j !== i) });
              }}
            >
              <IconTrash size={14} />
            </ActionIcon>
          </div>
        ))}
        <Button
          size="xs"
          variant="subtle"
          leftSection={<IconPlus size={14} />}
          onClick={() => {
            save({
              deductions: [
                ...deductions,
                {
                  id: newId('plannerItem'),
                  name: 'Deduction',
                  annual: 0,
                  pretax: true,
                  reduces: ['taxableIncome'],
                },
              ],
            });
          }}
        >
          Add deduction
        </Button>
      </section>

      <section>
        <h3 className={styles.heading}>Taxes</h3>
        <div className={clsx(styles.row, styles.taxRow, styles.head)}>
          <span>Tax</span>
          <span>On</span>
          <span>Rate</span>
          <span className={styles.num}>Amount</span>
          <span className={styles.num}>Of income</span>
          <span />
        </div>
        {result.taxes.map((line) => {
          const rule = line.rule;
          return (
            <div key={rule.id} className={clsx(styles.row, styles.taxRow)}>
              <span className={styles.taxName}>
                <button
                  type="button"
                  className={styles.linkButton}
                  onClick={() => {
                    setEditingRule(rule);
                  }}
                >
                  {rule.name}
                </button>
                {hasPeople && line.byPerson && line.byPerson.length > 0 && (
                  <span className={styles.byPerson}>
                    {line.byPerson
                      .map((p) => `${personName(p.person)} ${format.money(p.amount)}`)
                      .join(' · ')}
                  </span>
                )}
              </span>
              <span className={styles.dim}>{TAX_BASE_LABELS[rule.base]}</span>
              <span className={styles.dim}>{rateSummary(rule)}</span>
              <span className={styles.num}>{format.money(line.amount)}</span>
              <span className={clsx(styles.num, styles.dim)}>
                {result.gross > 0 ? `${((line.amount / result.gross) * 100).toFixed(1)}%` : '—'}
              </span>
              <span className={styles.actions}>
                <Tooltip label="Edit rule">
                  <ActionIcon
                    color="gray"
                    aria-label={`Edit ${rule.name}`}
                    onClick={() => {
                      setEditingRule(rule);
                    }}
                  >
                    <IconPencil size={14} />
                  </ActionIcon>
                </Tooltip>
                <ActionIcon
                  color="gray"
                  aria-label={`Remove ${rule.name}`}
                  onClick={() => {
                    save({ taxes: taxes.filter((t) => t.id !== rule.id) });
                  }}
                >
                  <IconTrash size={14} />
                </ActionIcon>
              </span>
            </div>
          );
        })}
        <Button
          size="xs"
          variant="subtle"
          leftSection={<IconPlus size={14} />}
          onClick={() => {
            const rule: TaxRule = {
              id: newId('plannerItem'),
              name: 'New tax',
              base: 'taxableIncome',
              schedule: { kind: 'flat', rate: 0.05 },
            };
            save({ taxes: [...taxes, rule] });
            setEditingRule(rule);
          }}
        >
          Add tax rule
        </Button>
      </section>

      <section>
        <h3 className={styles.heading}>Savings</h3>
        <div className={clsx(styles.row, styles.savingsRow, styles.head)}>
          <span />
          <span className={styles.num}>Per month</span>
          <span className={styles.num}>Per year</span>
        </div>
        <div className={clsx(styles.row, styles.savingsRow)}>
          <span className={styles.dim}>Set aside from take-home pay</span>
          <MoneyInput
            size="xs"
            variant="unstyled"
            aria-label="Savings per month"
            value={Math.round((scenario.savings ?? 0) / 12)}
            onCommit={(monthly) => {
              save({ savings: Math.max(0, monthly) * 12 });
            }}
          />
          <span className={clsx(styles.num, styles.dim)}>
            {format.money(scenario.savings ?? 0)}
          </span>
        </div>
        <p className={styles.note}>Not counted as left over after your budget.</p>
      </section>

      <TaxRuleDialog
        rule={editingRule}
        rules={taxes}
        onSave={(rule) => {
          save({ taxes: taxes.map((t) => (t.id === rule.id ? rule : t)) });
        }}
        onClose={() => {
          setEditingRule(null);
        }}
      />
    </div>
  );
}
