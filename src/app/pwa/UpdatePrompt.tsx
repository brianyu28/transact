import { Button, CloseButton } from '@mantine/core';
import { useRegisterSW } from 'virtual:pwa-register/react';
import styles from './UpdatePrompt.module.scss';

/**
 * Registers the service worker and asks before activating a new version,
 * so the app never reloads underneath unsaved work.
 */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh && !offlineReady) return null;

  const dismiss = () => {
    setNeedRefresh(false);
    setOfflineReady(false);
  };

  return (
    <div className={styles.toast} role="status">
      <span>
        {needRefresh ? 'A new version of Transact is available.' : 'Ready to work offline.'}
      </span>
      {needRefresh && (
        <Button onClick={() => void updateServiceWorker(true)} variant="filled">
          Reload
        </Button>
      )}
      <CloseButton size="sm" onClick={dismiss} aria-label="Dismiss" />
    </div>
  );
}
