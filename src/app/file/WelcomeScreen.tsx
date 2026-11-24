import { Alert, Button, Loader } from '@mantine/core';
import {
  IconAlertTriangle,
  IconBrandDropbox,
  IconFilePlus,
  IconFlask,
  IconFolderOpen,
  IconHistory,
} from '@tabler/icons-react';
import { useStore } from 'zustand';
import { dropboxState } from '@/persistence/adapters/dropbox';
import { isFsAccessSupported } from '@/persistence/adapters/fsAccess';
import { session, useSession } from '@/store/sessionStore';
import { uiStore } from '@/store/uiStore';
import styles from './WelcomeScreen.module.scss';

/** Shown in place of a screen when no document is open. */
export function WelcomeScreen() {
  const status = useSession((s) => s.status);
  const loadError = useSession((s) => s.loadError);
  const recent = useSession((s) => s.recent);
  const dropbox = useStore(dropboxState, (s) => s.connected);

  if (status === 'booting' || status === 'loading') {
    return (
      <div className={styles.center}>
        <Loader size="sm" />
      </div>
    );
  }

  const canReopen =
    (recent?.source.kind === 'fs-access' && isFsAccessSupported()) ||
    (recent?.source.kind === 'dropbox' && dropbox);

  return (
    <div className={styles.root}>
      <h2 className={styles.title}>Open your Transact file</h2>
      <p className={styles.lede}>
        Your data lives in a file you own. Transact never uploads it anywhere unless you choose
        Dropbox.
      </p>
      {loadError && (
        <Alert
          className={styles.error}
          color="red"
          variant="light"
          icon={<IconAlertTriangle size={16} />}
          title={`Couldn’t open ${loadError.fileName}`}
        >
          <span className={styles.preLine}>{loadError.message}</span>
        </Alert>
      )}
      <div className={styles.actions}>
        {canReopen && (
          <Button
            size="sm"
            leftSection={<IconHistory size={16} />}
            onClick={() => void session.reopenRecent()}
          >
            Reopen {recent.source.name}
          </Button>
        )}
        <Button
          size="sm"
          variant={canReopen ? 'default' : 'filled'}
          leftSection={<IconFolderOpen size={16} />}
          onClick={() => void session.open()}
        >
          Open file…
        </Button>
        {dropbox && (
          <Button
            size="sm"
            variant="default"
            leftSection={<IconBrandDropbox size={16} />}
            onClick={() => {
              uiStore.setState({ dropboxDialog: 'open' });
            }}
          >
            Open from Dropbox…
          </Button>
        )}
        <Button
          size="sm"
          variant="default"
          leftSection={<IconFilePlus size={16} />}
          onClick={() => {
            void session.newDocument('empty');
          }}
        >
          New file
        </Button>
        <Button
          size="sm"
          variant="subtle"
          leftSection={<IconFlask size={16} />}
          onClick={() => {
            void session.newDocument('demo');
          }}
        >
          Try with demo data
        </Button>
      </div>
      {!isFsAccessSupported() && (
        <p className={styles.hint}>
          This browser can’t save directly to files, so saving downloads a new copy. Chrome or Edge
          on desktop can save back to the same file.
        </p>
      )}
    </div>
  );
}
