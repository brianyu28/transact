import { CloseButton } from '@mantine/core';
import { clsx } from 'clsx';
import { dismissToast, useToasts } from '@/store/toastStore';
import styles from './Toaster.module.scss';

export function Toaster() {
  const toasts = useToasts();
  if (toasts.length === 0) return null;
  return (
    <div className={styles.root} role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={clsx(styles.toast, t.kind === 'error' && styles.error)}>
          <span className={styles.message}>{t.message}</span>
          {t.action && (
            <button
              type="button"
              className={styles.action}
              onClick={() => {
                t.action?.run();
                dismissToast(t.id);
              }}
            >
              {t.action.label}
            </button>
          )}
          <CloseButton
            size="xs"
            onClick={() => {
              dismissToast(t.id);
            }}
            aria-label="Dismiss"
          />
        </div>
      ))}
    </div>
  );
}
