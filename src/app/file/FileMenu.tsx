import { ActionIcon, Button, Menu, Tooltip } from '@mantine/core';
import {
  IconBrandDropbox,
  IconChevronDown,
  IconDeviceFloppy,
  IconFile,
  IconFileExport,
  IconFileLock,
  IconFilePlus,
  IconFolderOpen,
  IconX,
} from '@tabler/icons-react';
import { clsx } from 'clsx';
import { useStore } from 'zustand';
import { displayFileName, formatRelativeTime } from '@/lib/format';
import { dropboxState } from '@/persistence/adapters/dropbox';
import { selectIsDirty, useDocStore } from '@/store/docStore';
import { session, useSession } from '@/store/sessionStore';
import { uiStore } from '@/store/uiStore';
import { useDiscardGuard } from './useDiscardGuard';
import styles from './FileMenu.module.scss';

const MOD =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent) ? '⌘' : 'Ctrl+';

/** File name, save status and file actions, shown in the top bar. */
export function FileMenu() {
  const hasDoc = useDocStore((s) => s.doc !== null);
  const dirty = useDocStore(selectIsDirty);
  const source = useSession((s) => s.source);
  const saving = useSession((s) => s.saving);
  const lastSavedAt = useSession((s) => s.lastSavedAt);
  const encrypted = useSession((s) => s.encryption !== null);
  const [guard, discardModal] = useDiscardGuard();
  const dropbox = useStore(dropboxState, (s) => s.connected);

  if (!hasDoc) return discardModal;

  const name = source ? displayFileName(source.name) : 'Untitled';
  const status = saving
    ? 'Saving…'
    : dirty
      ? 'Unsaved changes'
      : lastSavedAt
        ? `Saved ${formatRelativeTime(lastSavedAt)}`
        : 'Saved';

  return (
    <div className={styles.root}>
      <Menu position="bottom-end" width={220}>
        <Menu.Target>
          <button
            type="button"
            className={styles.file}
            aria-label={`File: ${name}${encrypted ? ' (encrypted)' : ''}`}
            title={encrypted ? 'Encrypted with a passphrase' : undefined}
          >
            {encrypted ? (
              <IconFileLock size={14} stroke={1.75} aria-hidden />
            ) : (
              <IconFile size={14} stroke={1.75} aria-hidden />
            )}
            <span className={styles.name}>{name}</span>
            <span className={clsx(styles.status, dirty && styles.dirty)}>{status}</span>
            <IconChevronDown size={12} stroke={1.75} aria-hidden />
          </button>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item
            leftSection={<IconDeviceFloppy size={14} />}
            rightSection={<span className={styles.kbd}>{MOD}S</span>}
            onClick={() => void session.save()}
          >
            Save
          </Menu.Item>
          <Menu.Item
            leftSection={<IconFileExport size={14} />}
            onClick={() => void session.save({ saveAs: true })}
          >
            Save as…
          </Menu.Item>
          {dropbox && source?.kind !== 'dropbox' && (
            <Menu.Item
              leftSection={<IconBrandDropbox size={14} />}
              onClick={() => {
                uiStore.setState({ dropboxDialog: 'save' });
              }}
            >
              Save to Dropbox…
            </Menu.Item>
          )}
          <Menu.Divider />
          <Menu.Item
            leftSection={<IconFolderOpen size={14} />}
            rightSection={<span className={styles.kbd}>{MOD}O</span>}
            onClick={() => {
              guard(session.open);
            }}
          >
            Open…
          </Menu.Item>
          {dropbox && (
            <Menu.Item
              leftSection={<IconBrandDropbox size={14} />}
              onClick={() => {
                guard(() => {
                  uiStore.setState({ dropboxDialog: 'open' });
                });
              }}
            >
              Open from Dropbox…
            </Menu.Item>
          )}
          <Menu.Item
            leftSection={<IconFilePlus size={14} />}
            onClick={() => {
              guard(() => {
                void session.newDocument('empty');
              });
            }}
          >
            New file
          </Menu.Item>
          <Menu.Divider />
          <Menu.Item
            leftSection={<IconX size={14} />}
            onClick={() => {
              guard(session.close);
            }}
          >
            Close file
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
      <Tooltip label={`Save (${MOD}S)`}>
        <span className={styles.saveWide}>
          <Button
            size="compact-xs"
            variant={dirty ? 'filled' : 'subtle'}
            color={dirty ? 'accent' : 'gray'}
            loading={saving}
            onClick={() => void session.save()}
          >
            Save
          </Button>
        </span>
      </Tooltip>
      <ActionIcon
        className={styles.saveNarrow}
        variant={dirty ? 'filled' : 'subtle'}
        color={dirty ? 'accent' : 'gray'}
        loading={saving}
        onClick={() => void session.save()}
        aria-label="Save"
      >
        <IconDeviceFloppy size={16} stroke={1.75} />
      </ActionIcon>
      {discardModal}
    </div>
  );
}
