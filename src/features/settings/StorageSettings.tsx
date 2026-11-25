import { Button, Group, Modal, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { isFsAccessSupported } from '@/persistence/adapters/fsAccess';
import { session, useSession } from '@/store/sessionStore';
import { DropboxSettings } from './DropboxSettings';
import { EncryptionSettings } from './EncryptionSettings';
import styles from './StorageSettings.module.scss';

/** Where data is stored, and clearing everything kept in this browser. */
export function StorageSettings() {
  const source = useSession((s) => s.source);
  const hasDocument = useSession((s) => s.status === 'ready');
  const [confirming, { open, close }] = useDisclosure(false);

  return (
    <section className={styles.root}>
      <h2 className={styles.heading}>Storage</h2>
      <dl className={styles.grid}>
        <dt>File</dt>
        <dd>{!hasDocument ? 'No file open' : source ? source.name : 'Not saved yet'}</dd>
        <dt>Saving</dt>
        <dd>
          {source?.kind === 'dropbox'
            ? 'Saves to Dropbox. Changes saved from another device are merged with yours.'
            : isFsAccessSupported()
              ? 'Saves directly to the file on disk.'
              : 'This browser saves by downloading a new copy of the file.'}
        </dd>
        <dt>Working copy</dt>
        <dd>
          Unsaved changes are kept in this browser automatically, so they survive closing the tab.
        </dd>
      </dl>
      <EncryptionSettings />
      <DropboxSettings />
      <Button variant="light" color="red" onClick={open}>
        Clear local data…
      </Button>
      <Modal opened={confirming} onClose={close} title="Clear local data?" size="sm" centered>
        <Text size="sm" mb="md">
          This closes the file and removes everything Transact keeps in this browser: unsaved
          changes, remembered files and device preferences. Files on disk are not affected.
        </Text>
        <Group justify="flex-end" gap="xs">
          <Button variant="default" onClick={close}>
            Cancel
          </Button>
          <Button
            color="red"
            onClick={() => {
              close();
              void session.clearLocalData();
            }}
          >
            Clear local data
          </Button>
        </Group>
      </Modal>
    </section>
  );
}
