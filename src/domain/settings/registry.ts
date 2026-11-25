/**
 * Every user-facing setting is declared once here. The Settings screen is generated
 * from this list, so adding an option is a single entry. Settings live either in the
 * data file (shared by every device that opens it) or on the device.
 */
import type { FileSettings } from '../schema/types';

export type SettingControl =
  | { kind: 'select'; options: readonly { value: string; label: string }[] }
  | { kind: 'number'; min: number; max: number; suffix?: string }
  | { kind: 'boolean' };

interface BaseSetting {
  /** Stable key; for file settings, a dot path into FileSettings. */
  key: string;
  label: string;
  description?: string;
  section: SettingSection;
  control: SettingControl;
}

export type SettingSection = 'appearance' | 'regional' | 'budgets' | 'reconciliation';

export const SETTING_SECTIONS: readonly { id: SettingSection; title: string }[] = [
  { id: 'appearance', title: 'Appearance' },
  { id: 'regional', title: 'Regional' },
  { id: 'budgets', title: 'Budgets' },
  { id: 'reconciliation', title: 'Reconciliation' },
];

export interface FileSettingDef extends BaseSetting {
  scope: 'file';
}

export interface DeviceSettingDef extends BaseSetting {
  scope: 'device';
}

export type SettingDef = FileSettingDef | DeviceSettingDef;

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export const SETTINGS: readonly SettingDef[] = [
  // ── Device ──
  {
    scope: 'device',
    key: 'theme',
    section: 'appearance',
    label: 'Theme',
    control: {
      kind: 'select',
      options: [
        { value: 'auto', label: 'Match system' },
        { value: 'light', label: 'Light' },
        { value: 'dark', label: 'Dark' },
      ],
    },
  },
  {
    scope: 'device',
    key: 'density',
    section: 'appearance',
    label: 'Density',
    control: {
      kind: 'select',
      options: [
        { value: 'compact', label: 'Compact' },
        { value: 'comfortable', label: 'Comfortable' },
      ],
    },
  },
  {
    scope: 'device',
    key: 'dateFormat',
    section: 'appearance',
    label: 'Date format',
    control: {
      kind: 'select',
      options: [
        { value: 'medium', label: 'Nov 24, 2026' },
        { value: 'numeric', label: '11/24/2026' },
        { value: 'iso', label: '2026-11-24' },
      ],
    },
  },
  // ── File ──
  {
    scope: 'file',
    key: 'currency',
    section: 'regional',
    label: 'Currency',
    control: {
      kind: 'select',
      options: [
        { value: 'USD', label: 'US dollar (USD)' },
        { value: 'EUR', label: 'Euro (EUR)' },
        { value: 'GBP', label: 'British pound (GBP)' },
        { value: 'CAD', label: 'Canadian dollar (CAD)' },
        { value: 'AUD', label: 'Australian dollar (AUD)' },
      ],
    },
  },
  {
    scope: 'file',
    key: 'locale',
    section: 'regional',
    label: 'Number format',
    control: {
      kind: 'select',
      options: [
        { value: 'en-US', label: '1,234.56 (US)' },
        { value: 'en-GB', label: '1,234.56 (UK)' },
        { value: 'de-DE', label: '1.234,56 (Germany)' },
        { value: 'fr-FR', label: '1 234,56 (France)' },
      ],
    },
  },
  {
    scope: 'file',
    key: 'weekStartsOn',
    section: 'regional',
    label: 'Week starts on',
    control: {
      kind: 'select',
      options: [
        { value: '0', label: 'Sunday' },
        { value: '1', label: 'Monday' },
      ],
    },
  },
  {
    scope: 'file',
    key: 'budgetYearStartMonth',
    section: 'budgets',
    label: 'Annual budgets start in',
    control: {
      kind: 'select',
      options: MONTHS.map((m, i) => ({ value: String(i + 1), label: m })),
    },
  },
  {
    scope: 'file',
    key: 'budget.everythingElseTier',
    section: 'budgets',
    label: '“Everything Else” preference',
    description: 'Whether to prefer tracking unbudgeted transactions in monthly or annual budgets',
    control: {
      kind: 'select',
      options: [
        { value: 'monthly', label: 'Monthly' },
        { value: 'annual', label: 'Annual' },
      ],
    },
  },
  {
    scope: 'file',
    key: 'budget.tierOrder',
    section: 'budgets',
    label: 'Budget preference',
    description: 'Budget to use when both monthly and annual budgets include same category',
    control: {
      kind: 'select',
      options: [
        { value: 'monthly,annual', label: 'Monthly' },
        { value: 'annual,monthly', label: 'Annual' },
      ],
    },
  },
  {
    scope: 'file',
    key: 'budget.uncategorizedToEverythingElse',
    section: 'budgets',
    label: 'Count uncategorized spending in “Everything Else”',
    control: { kind: 'boolean' },
  },
  {
    scope: 'file',
    key: 'budget.defaultRolloverPolicy',
    section: 'budgets',
    label: 'Default rollover for new lines',
    control: {
      kind: 'select',
      options: [
        { value: 'prompt', label: 'Ask each period' },
        { value: 'full', label: 'Roll over everything' },
        { value: 'none', label: 'Never roll over' },
      ],
    },
  },
  {
    scope: 'file',
    key: 'reconcileGraceDays',
    section: 'reconciliation',
    label: 'Statement date flexibility',
    description:
      'Transactions this many days outside a statement period are offered when reconciling.',
    control: { kind: 'number', min: 0, max: 60, suffix: 'days' },
  },
];

/** Reads a file setting as the string/number/boolean the control works with. */
export function readFileSetting(settings: FileSettings, key: string): string | number | boolean {
  const value = key
    .split('.')
    .reduce<unknown>((obj, part) => (obj as Record<string, unknown>)[part], settings);
  if (Array.isArray(value)) return value.join(',');
  if (typeof value === 'number' && key !== 'reconcileGraceDays') return String(value);
  return value as string | number | boolean;
}

/** Converts a control value back into a partial FileSettings update. */
export function fileSettingPatch(
  settings: FileSettings,
  key: string,
  value: string | number | boolean,
): Partial<FileSettings> {
  const coerce = (current: unknown): unknown => {
    if (Array.isArray(current)) return String(value).split(',');
    if (typeof current === 'number') return Number(value);
    return value;
  };
  const [head, sub] = key.split('.') as [keyof FileSettings, string | undefined];
  if (sub === undefined) return { [head]: coerce(settings[head]) };
  const group = settings[head] as unknown as Record<string, unknown>;
  return { [head]: { ...group, [sub]: coerce(group[sub]) } };
}
