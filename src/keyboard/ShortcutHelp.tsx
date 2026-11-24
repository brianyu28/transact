import { Anchor, Modal } from '@mantine/core';
import { Link } from 'wouter';
import { KeyBinding } from '@/components/KeyBinding/KeyBinding';
import { usePrefs } from '@/store/prefsStore';
import { uiStore, useUi } from '@/store/uiStore';
import { COMMAND_GROUPS, COMMANDS } from './catalog';
import { bindingsFor } from './registry';
import styles from './ShortcutHelp.module.scss';

/** "?" overlay listing every shortcut, grouped. */
export function ShortcutHelp() {
  const opened = useUi((s) => s.helpOpen);
  const overrides = usePrefs((s) => s.keybindings);
  const close = () => {
    uiStore.setState({ helpOpen: false });
  };
  return (
    <Modal opened={opened} onClose={close} title="Keyboard shortcuts" size="xl">
      <div className={styles.grid}>
        {COMMAND_GROUPS.map((group) => (
          <section key={group} className={styles.group}>
            <h3 className={styles.heading}>{group}</h3>
            <dl className={styles.list}>
              {COMMANDS.filter((c) => c.group === group).map((c) => {
                const bindings = bindingsFor(c.id, overrides);
                return (
                  <div key={c.id} className={styles.row}>
                    <dt>{c.title}</dt>
                    <dd>
                      {bindings.length === 0 ? (
                        <span className={styles.none}>—</span>
                      ) : (
                        bindings.map((b) => <KeyBinding key={b} binding={b} />)
                      )}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </section>
        ))}
      </div>
      <p className={styles.footer}>
        <Anchor component={Link} href="/settings/keyboard" onClick={close} size="sm">
          Customize shortcuts
        </Anchor>
      </p>
    </Modal>
  );
}
