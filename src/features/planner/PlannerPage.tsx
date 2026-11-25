import { Button, Menu, NumberInput } from '@mantine/core';
import { IconCalendarRepeat, IconCopy, IconDots, IconPlus, IconTrash } from '@tabler/icons-react';
import { clsx } from 'clsx';
import { useMemo, useState } from 'react';
import { Link, useLocation, useParams } from 'wouter';
import { InlineEdit } from '@/components/InlineEdit/InlineEdit';
import { computeScenario } from '@/domain/planner/engine';
import { needsTaxYearUpdate, planTaxYearUpdate } from '@/domain/planner/taxYearUpdate';
import { US_TAX_YEARS, usTaxYearFor } from '@/domain/planner/taxYears';
import type { PlannerScenario } from '@/domain/schema/types';
import { useFormat } from '@/hooks/useFormat';
import { toastWithUndo, tryDispatch, tryRun } from '@/store/actions';
import { useDocStore } from '@/store/docStore';
import { CompareScenarios } from './CompareScenarios';
import { NewScenarioDialog } from './NewScenarioDialog';
import { ScenarioEditor } from './ScenarioEditor';
import { ScenarioSummary } from './ScenarioSummary';
import { TaxYearUpdateDialog } from './TaxYearUpdateDialog';
import { usePlannerContext } from './usePlannerContext';
import styles from './PlannerPage.module.scss';

const COMPARE = 'compare';
const MIN_YEAR = 1900;
const MAX_YEAR = 2200;
const LATEST_YEAR = (US_TAX_YEARS.at(-1) as { year: number }).year;

/** Plan income: taxes and deductions → take-home pay, compared with the budget. */
export function PlannerPage() {
  const { id } = useParams<{ id?: string }>();
  const scenariosMap = useDocStore((s) => s.doc?.planner.scenarios);
  const [creating, setCreating] = useState(false);
  const format = useFormat();
  const scenarios = useMemo(
    () =>
      Object.values(scenariosMap ?? {}).sort(
        (a, b) => a.year - b.year || a.name.localeCompare(b.name),
      ),
    [scenariosMap],
  );
  const selected =
    id === COMPARE ? undefined : (scenarios.find((s) => s.id === id) ?? scenarios[0]);

  if (scenarios.length === 0) {
    return (
      <div className={styles.empty}>
        <h2>Plan income, taxes, and deductions</h2>
        <p>Calculate take-home pay based on income, taxes, and deductions.</p>
        <Button
          leftSection={<IconPlus size={14} />}
          onClick={() => {
            setCreating(true);
          }}
        >
          Create a scenario
        </Button>
        <NewScenarioDialog
          opened={creating}
          onClose={() => {
            setCreating(false);
          }}
        />
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <nav className={styles.bar} aria-label="Scenarios">
        {scenarios.map((s) => (
          <Link
            key={s.id}
            href={`/planner/${s.id}`}
            className={clsx(styles.chip, s.id === selected?.id && styles.active)}
          >
            <span>{s.name}</span>
            <span className={styles.chipValue}>
              {format.money(computeScenario(s).monthlyTakeHome)}/mo
            </span>
          </Link>
        ))}
        {scenarios.length > 1 && (
          <Link
            href={`/planner/${COMPARE}`}
            className={clsx(styles.chip, id === COMPARE && styles.active)}
          >
            Compare
          </Link>
        )}
        <Button
          size="xs"
          variant="subtle"
          leftSection={<IconPlus size={14} />}
          onClick={() => {
            setCreating(true);
          }}
        >
          New scenario
        </Button>
      </nav>
      {id === COMPARE ? (
        <CompareScenarios scenarios={scenarios} />
      ) : (
        selected && <ScenarioView key={selected.id} scenario={selected} />
      )}
      <NewScenarioDialog
        opened={creating}
        onClose={() => {
          setCreating(false);
        }}
      />
    </div>
  );
}

function ScenarioView({ scenario }: { scenario: PlannerScenario }) {
  const result = useMemo(() => computeScenario(scenario), [scenario]);
  const context = usePlannerContext();
  const [, navigate] = useLocation();
  const [year, setYear] = useState<number | string>(scenario.year);
  // Follow changes made elsewhere (undo/redo).
  const [syncedYear, setSyncedYear] = useState(scenario.year);
  if (syncedYear !== scenario.year) {
    setSyncedYear(scenario.year);
    setYear(scenario.year);
  }
  const rulesYear = usTaxYearFor(scenario.year).year;
  const [updatingTo, setUpdatingTo] = useState<number | null>(null);
  const hasTemplateRules = useMemo(
    () => (planTaxYearUpdate(scenario.taxes, LATEST_YEAR)?.updates.length ?? 0) > 0,
    [scenario.taxes],
  );
  // The scenario's year has published figures its template rules don't use yet.
  const outdated = useMemo(
    () => needsTaxYearUpdate(planTaxYearUpdate(scenario.taxes, scenario.year)),
    [scenario.taxes, scenario.year],
  );
  return (
    <div className={styles.scenario}>
      <header className={styles.header}>
        <h2 className={styles.title}>
          <InlineEdit
            label="Scenario name"
            value={scenario.name}
            onCommit={(name) => tryRun('updateScenario', { id: scenario.id, changes: { name } })}
          />
        </h2>
        <NumberInput
          size="xs"
          aria-label="Tax year"
          value={year}
          allowDecimal={false}
          min={MIN_YEAR}
          max={MAX_YEAR}
          w={80}
          onChange={(v) => {
            setYear(v);
            // Commits whole years as they're stepped or typed; partial input waits.
            if (typeof v === 'number' && v >= MIN_YEAR && v <= MAX_YEAR && v !== scenario.year)
              tryRun('updateScenario', { id: scenario.id, changes: { year: v } });
          }}
          onBlur={() => {
            setYear(scenario.year);
          }}
        />
        {outdated && (
          <Button
            size="xs"
            variant="light"
            onClick={() => {
              setUpdatingTo(scenario.year);
            }}
          >
            Update tax rules to {scenario.year}
          </Button>
        )}
        <Menu position="bottom-end">
          <Menu.Target>
            <Button variant="subtle" color="gray" px={6} aria-label="Scenario actions">
              <IconDots size={16} />
            </Button>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item
              leftSection={<IconCopy size={14} />}
              onClick={() => {
                const copy = tryDispatch('duplicateScenario', { id: scenario.id });
                if (copy) navigate(`/planner/${copy}`);
              }}
            >
              Duplicate (for “what if”)
            </Menu.Item>
            {hasTemplateRules && (
              <Menu.Item
                leftSection={<IconCalendarRepeat size={14} />}
                onClick={() => {
                  setUpdatingTo(outdated ? scenario.year : LATEST_YEAR);
                }}
              >
                Update tax rules to another year…
              </Menu.Item>
            )}
            <Menu.Item
              onClick={() =>
                tryRun('addTemplateRules', {
                  id: scenario.id,
                  template: { filing: 'single', selfEmployment: true, stateRate: 0 },
                })
              }
            >
              Add US {rulesYear} tax rules (single, incl. self-employment)
            </Menu.Item>
            <Menu.Item
              onClick={() =>
                tryRun('addTemplateRules', {
                  id: scenario.id,
                  template: { filing: 'mfj', selfEmployment: true, stateRate: 0 },
                })
              }
            >
              Add US {rulesYear} tax rules (married filing jointly)
            </Menu.Item>
            <Menu.Divider />
            <Menu.Item
              color="red"
              leftSection={<IconTrash size={14} />}
              onClick={() => {
                if (tryRun('deleteScenario', { id: scenario.id })) {
                  toastWithUndo(`Deleted ${scenario.name}`);
                  navigate('/planner');
                }
              }}
            >
              Delete scenario
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </header>
      <TaxYearUpdateDialog
        scenario={scenario}
        year={updatingTo}
        onClose={() => {
          setUpdatingTo(null);
        }}
      />
      <div className={styles.columns}>
        <ScenarioEditor scenario={scenario} result={result} />
        <div className={styles.summaryColumn}>
          <ScenarioSummary
            result={result}
            savings={scenario.savings ?? 0}
            budgetPerYear={context.budgetPerYear}
            actualIncome={context.actualIncome}
          />
        </div>
      </div>
    </div>
  );
}
