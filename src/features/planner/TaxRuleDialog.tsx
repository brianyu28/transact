import {
  ActionIcon,
  Button,
  Checkbox,
  Group,
  Modal,
  MultiSelect,
  NumberInput,
  SegmentedControl,
  Select,
  Text,
  TextInput,
} from '@mantine/core';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { useState } from 'react';
import { MoneyInput } from '@/components/MoneyInput/MoneyInput';
import { TAX_BASE_LABELS, type TaxBase } from '@/domain/planner/engine';
import type { TaxRule } from '@/domain/schema/types';
import styles from './TaxRuleDialog.module.scss';

const BASES = Object.entries(TAX_BASE_LABELS).map(([value, label]) => ({ value, label }));
const pct = (rate: number) => Math.round(rate * 100_000) / 1000;

interface TaxRuleDialogProps {
  rule: TaxRule | null;
  /** All rules in the scenario (for "less other taxes"). */
  rules: readonly TaxRule[];
  onSave: (rule: TaxRule) => void;
  onClose: () => void;
}

/** Edit every part of a tax rule; see engine.ts for how they combine. */
export function TaxRuleDialog({ rule, rules, onSave, onClose }: TaxRuleDialogProps) {
  return (
    <Modal
      opened={rule !== null}
      onClose={onClose}
      title={rule ? `Tax rule · ${rule.name}` : ''}
      size="lg"
    >
      {rule && (
        <TaxRuleForm key={rule.id} rule={rule} rules={rules} onSave={onSave} onClose={onClose} />
      )}
    </Modal>
  );
}

function TaxRuleForm({
  rule,
  rules,
  onSave,
  onClose,
}: {
  rule: TaxRule;
  rules: readonly TaxRule[];
  onSave: (r: TaxRule) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<TaxRule>(rule);
  const set = (patch: Partial<TaxRule>) => {
    setDraft((d) => ({ ...d, ...patch }));
  };
  const unset = (key: keyof TaxRule) => {
    setDraft((d) => {
      const next = { ...d };
      Reflect.deleteProperty(next, key);
      return next;
    });
  };
  const optionalMoney = (
    key: 'deduction' | 'cap' | 'threshold',
    label: string,
    description: string,
  ) => (
    <MoneyInput
      label={label}
      description={description}
      value={draft[key] ?? 0}
      onCommit={(v) => {
        if (v === 0) unset(key);
        else set({ [key]: v });
      }}
    />
  );
  const others = rules.filter((r) => r.id !== rule.id);
  const schedule = draft.schedule;

  return (
    <div className={styles.form}>
      <Group grow>
        <TextInput
          label="Name"
          value={draft.name}
          onChange={(e) => {
            set({ name: e.currentTarget.value });
          }}
        />
        <Select
          label="Taxed on"
          data={BASES}
          value={draft.base}
          allowDeselect={false}
          onChange={(v) => {
            if (v) set({ base: v as TaxBase });
          }}
        />
      </Group>
      <Group grow align="flex-start">
        <NumberInput
          label="Percent of earnings taxed"
          description="e.g. 92.35% for self-employment"
          value={pct(draft.baseFactor ?? 1)}
          suffix="%"
          decimalScale={3}
          min={0}
          max={100}
          onChange={(v) => {
            if (typeof v !== 'number') return;
            if (v === 100) unset('baseFactor');
            else set({ baseFactor: v / 100 });
          }}
        />
        {optionalMoney('deduction', 'Deduction', 'Subtracted first, e.g. the standard deduction')}
      </Group>
      <Group grow align="flex-start">
        {optionalMoney('cap', 'Cap', 'Maximum amount taxed (0 = none)')}
        <Select
          label="Cap reduced by"
          description="e.g. W-2 wages, for self-employment Social Security"
          data={BASES}
          value={draft.capReducedBy ?? null}
          clearable
          onChange={(v) => {
            if (v) set({ capReducedBy: v as TaxBase });
            else unset('capReducedBy');
          }}
        />
      </Group>
      {optionalMoney('threshold', 'Threshold', 'Only the amount above this is taxed (0 = none)')}
      <Checkbox
        label="Calculate separately for each person"
        description="For taxes with per-person limits, like Social Security’s wage base. Cap and threshold then apply to each person."
        checked={draft.perPerson === true}
        onChange={(e) => {
          if (e.currentTarget.checked) set({ perPerson: true });
          else unset('perPerson');
        }}
      />
      <MultiSelect
        label="Less other taxes"
        description="Half of each selected tax is subtracted from the base first (e.g. half of self-employment tax)."
        data={others.map((r) => ({ value: r.id, label: r.name }))}
        value={(draft.lessTaxes ?? []).map((l) => l.taxId)}
        onChange={(ids) => {
          if (ids.length === 0) unset('lessTaxes');
          else
            set({
              lessTaxes: ids.map((taxId) => ({
                taxId,
                fraction: draft.lessTaxes?.find((l) => l.taxId === taxId)?.fraction ?? 0.5,
              })),
            });
        }}
      />

      <div>
        <Text size="sm" fw={500} mb={4}>
          Rate
        </Text>
        <SegmentedControl
          size="xs"
          data={[
            { value: 'flat', label: 'Flat rate' },
            { value: 'brackets', label: 'Brackets' },
          ]}
          value={schedule.kind}
          onChange={(v) => {
            set({
              schedule:
                v === 'flat'
                  ? { kind: 'flat', rate: schedule.kind === 'flat' ? schedule.rate : 0.05 }
                  : {
                      kind: 'brackets',
                      brackets:
                        schedule.kind === 'brackets'
                          ? schedule.brackets
                          : [{ upTo: null, rate: schedule.rate }],
                    },
            });
          }}
          mb="xs"
        />
        {schedule.kind === 'flat' ? (
          <NumberInput
            aria-label="Rate"
            value={pct(schedule.rate)}
            suffix="%"
            decimalScale={3}
            min={0}
            max={100}
            w={140}
            onChange={(v) => {
              if (typeof v === 'number') set({ schedule: { kind: 'flat', rate: v / 100 } });
            }}
          />
        ) : (
          <div className={styles.brackets}>
            {schedule.brackets.map((b, i) => {
              const lower = i === 0 ? 0 : (schedule.brackets[i - 1]?.upTo ?? 0);
              const update = (patch: Partial<(typeof schedule.brackets)[number]>) => {
                set({
                  schedule: {
                    kind: 'brackets',
                    brackets: schedule.brackets.map((x, j) => (j === i ? { ...x, ...patch } : x)),
                  },
                });
              };
              const last = i === schedule.brackets.length - 1;
              return (
                <div key={i} className={styles.bracket}>
                  <NumberInput
                    size="xs"
                    aria-label="Rate"
                    value={pct(b.rate)}
                    suffix="%"
                    decimalScale={3}
                    min={0}
                    max={100}
                    onChange={(v) => {
                      if (typeof v === 'number') update({ rate: v / 100 });
                    }}
                  />
                  <span className={styles.bracketText}>
                    from {(lower / 100).toLocaleString()} up to
                  </span>
                  {last ? (
                    <span className={styles.bracketText}>and above</span>
                  ) : (
                    <MoneyInput
                      size="xs"
                      aria-label="Up to"
                      value={b.upTo ?? 0}
                      onCommit={(upTo) => {
                        update({ upTo });
                      }}
                    />
                  )}
                  <ActionIcon
                    color="gray"
                    aria-label="Remove bracket"
                    disabled={schedule.brackets.length === 1}
                    onClick={() => {
                      const brackets = schedule.brackets.filter((_, j) => j !== i);
                      const lastBracket = brackets[brackets.length - 1];
                      if (lastBracket)
                        brackets[brackets.length - 1] = { ...lastBracket, upTo: null };
                      set({ schedule: { kind: 'brackets', brackets } });
                    }}
                  >
                    <IconTrash size={14} />
                  </ActionIcon>
                </div>
              );
            })}
            <Button
              size="xs"
              variant="subtle"
              leftSection={<IconPlus size={14} />}
              onClick={() => {
                const brackets = [...schedule.brackets];
                const top = brackets[brackets.length - 1];
                const below = brackets[brackets.length - 2]?.upTo ?? 0;
                if (top) brackets[brackets.length - 1] = { ...top, upTo: below + 1_000_000 };
                brackets.push({ upTo: null, rate: top?.rate ?? 0 });
                set({ schedule: { kind: 'brackets', brackets } });
              }}
            >
              Add bracket
            </Button>
          </div>
        )}
      </div>

      <Group justify="flex-end" gap="xs">
        <Button variant="default" onClick={onClose}>
          Cancel
        </Button>
        <Button
          onClick={() => {
            onSave(draft);
            onClose();
          }}
        >
          Save rule
        </Button>
      </Group>
    </div>
  );
}
