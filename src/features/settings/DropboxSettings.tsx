import { Button, Group, TextInput } from '@mantine/core';
import { IconBrandDropbox } from '@tabler/icons-react';
import { useState } from 'react';
import { useStore } from 'zustand';
import {
  DROPBOX_FOLDER,
  DROPBOX_NOT_REVOKED,
  connectDropbox,
  disconnectDropbox,
  dropboxState,
  setDropboxAppKey,
} from '@/persistence/adapters/dropbox';
import { toast } from '@/store/toastStore';
import styles from './StorageSettings.module.scss';

const BUILT_IN_KEY = (import.meta.env.VITE_DROPBOX_APP_KEY as string | undefined) ?? '';

/** Connecting this device to Dropbox (and, for self-hosted builds, the app key). */
export function DropboxSettings() {
  const { connected, appKey } = useStore(dropboxState);
  const [draftKey, setDraftKey] = useState(appKey);

  return (
    <>
      <dl className={styles.grid}>
        <dt>Dropbox</dt>
        <dd>
          {connected
            ? `Connected on this device. Files live in ${DROPBOX_FOLDER} in your Dropbox; Transact can’t see anything else there.`
            : 'Keep your file in Dropbox to use it from several devices. Changes made on two devices are merged.'}
        </dd>
      </dl>
      {!BUILT_IN_KEY && !connected && (
        <Group gap="xs" mb="xs" align="flex-end">
          <TextInput
            label="Dropbox app key"
            description="This build has no app key. Create a Dropbox app (scoped, App folder) and paste its key."
            value={draftKey}
            onChange={(e) => {
              setDraftKey(e.currentTarget.value);
            }}
            onBlur={() => {
              setDropboxAppKey(draftKey);
            }}
            w={360}
          />
        </Group>
      )}
      <Group gap="xs" mb="md">
        {connected ? (
          <Button
            variant="default"
            leftSection={<IconBrandDropbox size={14} />}
            onClick={() =>
              void disconnectDropbox().then((revoked) => {
                toast(revoked ? 'Disconnected from Dropbox.' : DROPBOX_NOT_REVOKED);
              })
            }
          >
            Disconnect Dropbox
          </Button>
        ) : (
          <Button
            variant="light"
            leftSection={<IconBrandDropbox size={14} />}
            disabled={!appKey && !draftKey.trim()}
            onClick={() => {
              setDropboxAppKey(BUILT_IN_KEY ? '' : draftKey);
              connectDropbox().catch((err: unknown) => {
                toast(err instanceof Error ? err.message : String(err));
              });
            }}
          >
            Connect Dropbox…
          </Button>
        )}
      </Group>
    </>
  );
}
