import {
  Button,
  Checkbox,
  Group,
  Modal,
  NumberInput,
  SegmentedControl,
  Text,
  TextInput,
} from '@mantine/core';
import { useState } from 'react';
import { useLocation } from 'wouter';
import { usTaxYearFor, type FilingStatus } from '@/domain/planner/taxYears';
import { dateParts, today } from '@/lib/date';
import { tryDispatch } from '@/store/actions';

export function NewScenarioDialog({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  return (
    <Modal opened={opened} onClose={onClose} title="New scenario" size="sm">
      {opened && <NewScenarioForm onClose={onClose} />}
    </Modal>
  );
}

function NewScenarioForm({ onClose }: { onClose: () => void }) {
  const [, navigate] = useLocation();
  const [name, setName] = useState('My income');
  const [year, setYear] = useState(dateParts(today()).year);
  const [template, setTemplate] = useState<'us' | 'blank'>('us');
  const [filing, setFiling] = useState<FilingStatus>('single');
  const [selfEmployment, setSelfEmployment] = useState(false);
  const [statePercent, setStatePercent] = useState<number>(5);

  const create = () => {
    const id = tryDispatch('createScenario', {
      name,
      year,
      template:
        template === 'us' ? { filing, selfEmployment, stateRate: statePercent / 100 } : null,
    });
    if (id) {
      onClose();
      navigate(`/planner/${id}`);
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        create();
      }}
    >
      <TextInput
        data-autofocus
        label="Name"
        value={name}
        onChange={(e) => {
          setName(e.currentTarget.value);
        }}
        mb="sm"
      />
      <NumberInput
        label="Tax year"
        value={year}
        onChange={(v) => {
          if (typeof v === 'number') setYear(v);
        }}
        allowDecimal={false}
        mb="sm"
      />
      <Text size="sm" fw={500} mb={4}>
        Start from
      </Text>
      <SegmentedControl
        fullWidth
        data={[
          { value: 'us', label: `US tax rules (${String(usTaxYearFor(year).year)})` },
          { value: 'blank', label: 'Blank' },
        ]}
        value={template}
        onChange={(v) => {
          setTemplate(v === 'blank' ? 'blank' : 'us');
        }}
        mb="sm"
      />
      {template === 'us' && (
        <>
          <SegmentedControl
            fullWidth
            size="xs"
            data={[
              { value: 'single', label: 'Single' },
              { value: 'mfj', label: 'Married filing jointly' },
            ]}
            value={filing}
            onChange={(v) => {
              setFiling(v === 'mfj' ? 'mfj' : 'single');
            }}
            mb="sm"
          />
          <Checkbox
            label="Include self-employment tax (1099 income)"
            checked={selfEmployment}
            onChange={(e) => {
              setSelfEmployment(e.currentTarget.checked);
            }}
            mb="sm"
          />
          <NumberInput
            label="State income tax (flat rate)"
            description="Use 0 for no state income tax. You can replace it with brackets later."
            value={statePercent}
            onChange={(v) => {
              if (typeof v === 'number') setStatePercent(v);
            }}
            suffix="%"
            min={0}
            max={20}
            decimalScale={3}
            mb="sm"
          />
          <Text size="xs" c="dimmed" mb="sm">
            Templates are a starting point, not tax advice.
          </Text>
        </>
      )}
      <Group justify="flex-end" gap="xs">
        <Button variant="default" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit">Create</Button>
      </Group>
    </form>
  );
}
