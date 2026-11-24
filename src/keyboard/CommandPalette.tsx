import { Modal, TextInput } from '@mantine/core';
import { IconSearch } from '@tabler/icons-react';
import { clsx } from 'clsx';
import { useState, type KeyboardEvent } from 'react';
import { KeyBinding } from '@/components/KeyBinding/KeyBinding';
import { uiStore, useUi } from '@/store/uiStore';
import { COMMANDS, type CommandId } from './catalog';
import { bindingsFor, isCommandAvailable, runCommand, useRegistryVersion } from './registry';
import styles from './CommandPalette.module.scss';

function matches(title: string, query: string): boolean {
  const t = title.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .every((word) => t.includes(word));
}

/** ⌘K: search and run any command that's available right now. */
export function CommandPalette() {
  const opened = useUi((s) => s.paletteOpen);
  const close = () => {
    uiStore.setState({ paletteOpen: false });
  };
  return (
    <Modal
      opened={opened}
      onClose={close}
      withCloseButton={false}
      size="md"
      padding={0}
      yOffset="12vh"
      transitionProps={{ duration: 80 }}
    >
      {opened && <PaletteBody onClose={close} />}
    </Modal>
  );
}

function PaletteBody({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);

  // Re-render when handlers attach or detach, since that changes what's available.
  useRegistryVersion();
  const results = COMMANDS.filter(
    (c) => c.id !== 'app.palette' && isCommandAvailable(c.id) && matches(c.title, query),
  );

  const run = (id: CommandId) => {
    onClose();
    // Let the modal close (and focus return) before the command runs.
    setTimeout(() => runCommand(id), 0);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const command = results[active];
      if (command) run(command.id);
    }
  };

  return (
    <div>
      <TextInput
        data-autofocus
        size="sm"
        variant="unstyled"
        placeholder="Type a command…"
        leftSection={<IconSearch size={16} />}
        value={query}
        onChange={(e) => {
          setQuery(e.currentTarget.value);
          setActive(0);
        }}
        onKeyDown={onKeyDown}
        classNames={{ root: styles.input }}
        aria-label="Command"
      />
      <ul className={styles.list} role="listbox">
        {results.length === 0 && <li className={styles.empty}>No matching commands</li>}
        {results.map((c, i) => {
          const [binding] = bindingsFor(c.id);
          return (
            <li
              key={c.id}
              role="option"
              aria-selected={i === active}
              className={clsx(styles.item, i === active && styles.active)}
              onMouseMove={() => {
                setActive(i);
              }}
              onClick={() => {
                run(c.id);
              }}
            >
              <span className={styles.group}>{c.group}</span>
              <span className={styles.title}>{c.title}</span>
              {binding && <KeyBinding binding={binding} />}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
