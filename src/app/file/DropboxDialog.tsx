import { Button, Group, Loader, Modal, Stack, Text, TextInput } from '@mantine/core';
import { useEffect, useState } from 'react';
import { formatRelativeTime } from '@/lib/format';
import { today } from '@/lib/date';
import { listDropboxFiles, type DropboxFile } from '@/persistence/adapters/dropbox';
import { FILE_EXTENSION } from '@/persistence/types';
import { session, useSession } from '@/store/sessionStore';
import { uiStore, useUi } from '@/store/uiStore';
import styles from './DropboxDialog.module.scss';

const close = () => {
  uiStore.setState({ dropboxDialog: null });
};

/** Opens a file from, or saves one to, the app's Dropbox folder. */
export function DropboxDialog() {
  const mode = useUi((s) => s.dropboxDialog);
  return (
    <Modal
      opened={mode !== null}
      onClose={close}
      title={mode === 'save' ? 'Save to Dropbox' : 'Open from Dropbox'}
      size="md"
      centered
    >
      {mode === 'open' && <OpenPane />}
      {mode === 'save' && <SavePane />}
    </Modal>
  );
}

function OpenPane() {
  const [files, setFiles] = useState<DropboxFile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    listDropboxFiles().then(setFiles, (err: unknown) => {
      setError(err instanceof Error ? err.message : String(err));
    });
  }, []);

  if (error)
    return (
      <Text c="red" size="sm">
        {error}
      </Text>
    );
  if (!files) return <Loader size="sm" />;
  if (files.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        No files yet. Open or create a file, then choose Save to Dropbox from the file menu.
      </Text>
    );
  }
  return (
    <ul className={styles.list}>
      {files.map((f) => (
        <li key={f.path}>
          <button
            type="button"
            className={styles.file}
            onClick={() => {
              close();
              void session.openFromDropbox(f.path);
            }}
          >
            <span className={styles.name}>{f.name}</span>
            <span className={styles.meta}>
              {formatRelativeTime(f.modified)} · {Math.ceil(f.size / 1024).toLocaleString()} KB
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function SavePane() {
  const current = useSession((s) => s.source?.name);
  const [name, setName] = useState(current ?? `Transact ${today()}${FILE_EXTENSION}`);
  const fileName = name.trim().endsWith('.json') ? name.trim() : `${name.trim()}${FILE_EXTENSION}`;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        close();
        void session.save({ saveAs: true, target: 'dropbox', name: fileName });
      }}
    >
      <Stack gap="sm">
        <TextInput
          label="File name"
          value={name}
          onChange={(e) => {
            setName(e.currentTarget.value);
          }}
          data-autofocus
        />
        <Text size="xs" c="dimmed">
          Saved in your Dropbox under Apps/Transact. Later saves go to this copy.
        </Text>
        <Group justify="flex-end" gap="xs">
          <Button variant="default" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" disabled={!name.trim()}>
            Save
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
