import { Button, Menu, NumberInput } from '@mantine/core';
import { IconCopy, IconDots, IconPlus, IconTrash } from '@tabler/icons-react';
import { clsx } from 'clsx';
import { useMemo, useState } from 'react';
import { Link, useLocation, useParams } from 'wouter';
import { InlineEdit } from '@/components/InlineEdit/InlineEdit';
import { computeScenario } from '@/domain/planner/engine';
import type { PlannerScenario } from '@/domain/schema/types';
import { useFormat } from '@/hooks/useFormat';
import { toastWithUndo, tryDispatch, tryRun } from '@/store/actions';
import { useDocStore } from '@/store/docStore';
import { CompareScenarios } from './CompareScenarios';
import { NewScenarioDialog } from './NewScenarioDialog';
import { ScenarioEditor } from './ScenarioEditor';
import { ScenarioSummary } from './ScenarioSummary';
import { usePlannerContext } from './usePlannerContext';
import styles from './PlannerPage.module.scss';

const COMPARE = 'compare';

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
        <h2>Plan your take-home pay</h2>
        <p>
          Enter your income, taxes and deductions to see what you take home each month and how it
          compares with your budget. Start from US tax rules or from scratch; everything is
          editable.
        </p>
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
        selected && <ScenarioView scenario={selected} />
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
          value={scenario.year}
          allowDecimal={false}
          w={80}
          onBlur={(e) => {
            const year = Number(e.currentTarget.value);
            if (Number.isInteger(year) && year !== scenario.year)
              tryRun('updateScenario', { id: scenario.id, changes: { year } });
          }}
        />
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
            <Menu.Item
              onClick={() =>
                tryRun('addTemplateRules', {
                  id: scenario.id,
                  template: { filing: 'single', selfEmployment: true, stateRate: 0 },
                })
              }
            >
              Add US tax rules (single, incl. self-employment)
            </Menu.Item>
            <Menu.Item
              onClick={() =>
                tryRun('addTemplateRules', {
                  id: scenario.id,
                  template: { filing: 'mfj', selfEmployment: true, stateRate: 0 },
                })
              }
            >
              Add US tax rules (married filing jointly)
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
      <div className={styles.columns}>
        <ScenarioEditor scenario={scenario} result={result} />
        <div className={styles.summaryColumn}>
          <ScenarioSummary
            result={result}
            budgetPerYear={context.budgetPerYear}
            actualIncome={context.actualIncome}
          />
        </div>
      </div>
    </div>
  );
}
