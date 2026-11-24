import { NumberInput, Select, Switch } from '@mantine/core';
import type { SettingDef } from '@/domain/settings/registry';
import styles from './SettingField.module.scss';

interface SettingFieldProps {
  def: SettingDef;
  value: string | number | boolean;
  onChange: (value: string | number | boolean) => void;
}

/** Renders one setting from the registry with the control it declares. */
export function SettingField({ def, value, onChange }: SettingFieldProps) {
  const id = `setting-${def.key}`;
  const { control } = def;
  return (
    <div className={styles.row}>
      <div className={styles.text}>
        <label htmlFor={id} className={styles.label}>
          {def.label}
        </label>
        {def.description && <p className={styles.description}>{def.description}</p>}
      </div>
      <div className={styles.control}>
        {control.kind === 'select' && (
          <Select
            id={id}
            data={control.options.map((o) => ({ value: o.value, label: o.label }))}
            value={String(value)}
            onChange={(v) => {
              if (v !== null) onChange(v);
            }}
            allowDeselect={false}
            w={220}
          />
        )}
        {control.kind === 'number' && (
          <NumberInput
            id={id}
            value={Number(value)}
            min={control.min}
            max={control.max}
            clampBehavior="strict"
            allowDecimal={false}
            {...(control.suffix ? { suffix: ` ${control.suffix}` } : {})}
            onChange={(v) => {
              if (typeof v === 'number') onChange(v);
            }}
            w={120}
          />
        )}
        {control.kind === 'boolean' && (
          <Switch
            id={id}
            checked={Boolean(value)}
            onChange={(e) => {
              onChange(e.currentTarget.checked);
            }}
          />
        )}
      </div>
    </div>
  );
}
