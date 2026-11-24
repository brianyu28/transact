import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../schema/defaults';
import { FileSettingsSchema } from '../schema/current';
import { fileSettingPatch, readFileSetting, SETTINGS } from './registry';

describe('settings registry', () => {
  it('round-trips every file setting through its control value', () => {
    for (const def of SETTINGS) {
      if (def.scope !== 'file') continue;
      const value = readFileSetting(DEFAULT_SETTINGS, def.key);
      const patched = {
        ...DEFAULT_SETTINGS,
        ...fileSettingPatch(DEFAULT_SETTINGS, def.key, value),
      };
      expect(patched).toEqual(DEFAULT_SETTINGS);
    }
  });

  it('produces valid settings for every select option', () => {
    for (const def of SETTINGS) {
      if (def.scope !== 'file' || def.control.kind !== 'select') continue;
      for (const option of def.control.options) {
        const patched = {
          ...DEFAULT_SETTINGS,
          ...fileSettingPatch(DEFAULT_SETTINGS, def.key, option.value),
        };
        expect(FileSettingsSchema.safeParse(patched).success, `${def.key}=${option.value}`).toBe(
          true,
        );
      }
    }
  });
});
