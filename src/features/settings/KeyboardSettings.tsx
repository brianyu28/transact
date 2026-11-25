import { ActionIcon, Button, Tooltip } from '@mantine/core';
import { IconPencil, IconRotate } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { KeyBinding } from '@/components/KeyBinding/KeyBinding';
import { COMMAND_GROUPS, COMMANDS, COMMANDS_BY_ID } from '@/keyboard/catalog';
import { comboFromEvent } from '@/keyboard/keys';
import { bindingsFor } from '@/keyboard/registry';
import { prefsStore, usePrefs } from '@/store/prefsStore';
import styles from './settings.module.scss';
import local from './KeyboardSettings.module.scss';

const SEQUENCE_PAUSE_MS = 900;

/** Lists every command; click the pencil, then press the new shortcut (up to two keys). */
export function KeyboardSettings() {
  const overrides = usePrefs((s) => s.keybindings);
  const [recording, setRecording] = useState<string | null>(null);
  const [captured, setCaptured] = useState<string[]>([]);

  useEffect(() => {
    if (!recording) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let combos: string[] = [];
    const finish = () => {
      if (combos.length > 0) prefsStore.getState().setKeybinding(recording, [combos.join(' ')]);
      setRecording(null);
      setCaptured([]);
    };
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape' && combos.length === 0) {
        setRecording(null);
        return;
      }
      const combo = comboFromEvent(e);
      if (!combo) return;
      combos = [...combos, combo];
      setCaptured(combos);
      clearTimeout(timer);
      if (combos.length >= 2) finish();
      else timer = setTimeout(finish, SEQUENCE_PAUSE_MS);
    };
    // Capture phase, so the global dispatcher never sees these keys.
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      clearTimeout(timer);
    };
  }, [recording]);

  // Bindings used by more than one command.
  const owners = new Map<string, string[]>();
  for (const c of COMMANDS) {
    for (const b of bindingsFor(c.id, overrides)) owners.set(b, [...(owners.get(b) ?? []), c.id]);
  }

  return (
    <section className={styles.section}>
      <div className={local.header}>
        <h2 className={styles.heading}>Keyboard shortcuts</h2>
        <Button
          variant="subtle"
          color="gray"
          leftSection={<IconRotate size={14} />}
          disabled={Object.keys(overrides).length === 0}
          onClick={() => {
            prefsStore.getState().resetKeybindings();
          }}
        >
          Reset all
        </Button>
      </div>
      <p className={styles.note}>
        Shortcuts are saved on this device. Press ? anywhere to see them.
      </p>
      {COMMAND_GROUPS.map((group) => (
        <table key={group} className={`${styles.table} ${local.table}`}>
          <thead>
            <tr>
              <th>{group}</th>
              <th />
              <th className={styles.actions} />
            </tr>
          </thead>
          <tbody>
            {COMMANDS.filter((c) => c.group === group).map((c) => {
              const bindings = bindingsFor(c.id, overrides);
              const custom = c.id in overrides;
              const conflicts = bindings.flatMap((b) =>
                (owners.get(b) ?? []).filter((id) => id !== c.id),
              );
              return (
                <tr key={c.id}>
                  <td>{c.title}</td>
                  <td>
                    {recording === c.id ? (
                      <span className={local.recording}>
                        {captured.length > 0 ? (
                          <KeyBinding binding={captured.join(' ')} />
                        ) : (
                          'Press keys…'
                        )}
                      </span>
                    ) : (
                      <span className={local.bindings}>
                        {bindings.length === 0 && <span className={styles.dim}>—</span>}
                        {bindings.map((b) => (
                          <KeyBinding key={b} binding={b} />
                        ))}
                        {conflicts.length > 0 && (
                          <span className={local.conflict}>
                            also {conflicts.map((id) => COMMANDS_BY_ID.get(id)?.title).join(', ')}
                          </span>
                        )}
                      </span>
                    )}
                  </td>
                  <td className={styles.actions}>
                    <Tooltip label="Change shortcut">
                      <ActionIcon
                        color="gray"
                        aria-label={`Change shortcut for ${c.title}`}
                        onClick={() => {
                          setCaptured([]);
                          setRecording(c.id);
                        }}
                      >
                        <IconPencil size={14} />
                      </ActionIcon>
                    </Tooltip>
                    {custom && (
                      <Tooltip label="Reset to default">
                        <ActionIcon
                          color="gray"
                          aria-label={`Reset shortcut for ${c.title}`}
                          onClick={() => {
                            prefsStore.getState().setKeybinding(c.id, null);
                          }}
                        >
                          <IconRotate size={14} />
                        </ActionIcon>
                      </Tooltip>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ))}
    </section>
  );
}
