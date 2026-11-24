import {
  fileSettingPatch,
  readFileSetting,
  SETTING_SECTIONS,
  SETTINGS,
} from '@/domain/settings/registry';
import { tryDispatch } from '@/store/actions';
import { useDocStore } from '@/store/docStore';
import { prefsStore, usePrefs, type DevicePrefs } from '@/store/prefsStore';
import { SettingField } from './SettingField';
import styles from './settings.module.scss';

/** All registry-declared settings, grouped by section. */
export function GeneralSettings() {
  const fileSettings = useDocStore((s) => s.doc?.settings);
  const prefs = usePrefs((s) => s);

  return (
    <>
      {SETTING_SECTIONS.map((section) => {
        const defs = SETTINGS.filter((d) => d.section === section.id);
        const fileOnly = defs.every((d) => d.scope === 'file');
        return (
          <section key={section.id} className={styles.section}>
            <h2 className={styles.heading}>{section.title}</h2>
            {fileOnly && (
              <p className={styles.note}>
                {fileSettings
                  ? 'Saved in your data file.'
                  : 'Open a file to change these settings.'}
              </p>
            )}
            {defs.map((def) => {
              if (def.scope === 'device') {
                return (
                  <SettingField
                    key={def.key}
                    def={def}
                    value={prefs[def.key as keyof DevicePrefs] as string}
                    onChange={(v) => {
                      prefsStore.getState().setPref(def.key as 'theme', v as DevicePrefs['theme']);
                    }}
                  />
                );
              }
              if (!fileSettings) return null;
              return (
                <SettingField
                  key={def.key}
                  def={def}
                  value={readFileSetting(fileSettings, def.key)}
                  onChange={(v) => {
                    tryDispatch('updateSettings', fileSettingPatch(fileSettings, def.key, v));
                  }}
                />
              );
            })}
          </section>
        );
      })}
    </>
  );
}
