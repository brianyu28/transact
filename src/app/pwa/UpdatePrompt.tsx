import { Button, CloseButton } from '@mantine/core';
import { useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { session } from '@/store/sessionStore';
import styles from './UpdatePrompt.module.scss';

/** How long to wait for the new service worker to take over before reloading anyway. */
const TAKEOVER_TIMEOUT_MS = 3000;

/**
 * Activates the waiting service worker and reloads once it controls the page. The plugin's
 * own reload only happens in some cases (e.g. not when the page loaded without a controller,
 * or when another window already activated the update), so this reloads whenever the new
 * worker takes over, and after a timeout regardless: the reload itself is what picks up
 * the new version.
 */
async function activateAndReload(updateServiceWorker: (reload?: boolean) => Promise<void>) {
  let reloading = false;
  const reload = () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  };
  // Edits are written to the working copy after a short delay; write them first.
  await session.flush();
  navigator.serviceWorker.addEventListener('controllerchange', reload, { once: true });
  setTimeout(reload, TAKEOVER_TIMEOUT_MS);
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration?.waiting) {
    // Nothing left to activate (another window already did): just reload.
    reload();
    return;
  }
  await updateServiceWorker(true);
}

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
  const [updating, setUpdating] = useState(false);

  if (!needRefresh && !offlineReady) return null;

  const dismiss = () => {
    setNeedRefresh(false);
    setOfflineReady(false);
  };

  return (
    <div className={styles.toast} role="status">
      <span>
        {needRefresh
          ? updating
            ? 'Updating Transact…'
            : 'A new version of Transact is available.'
          : 'Ready to work offline.'}
      </span>
      {needRefresh && (
        <Button
          variant="filled"
          loading={updating}
          onClick={() => {
            setUpdating(true);
            activateAndReload(updateServiceWorker).catch((err: unknown) => {
              console.error('Update failed', err);
              window.location.reload();
            });
          }}
        >
          Reload
        </Button>
      )}
      {!updating && <CloseButton size="sm" onClick={dismiss} aria-label="Dismiss" />}
    </div>
  );
}
