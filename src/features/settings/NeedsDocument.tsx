import type { ReactNode } from 'react';
import { useSession } from '@/store/sessionStore';
import styles from './settings.module.scss';

/** Settings stored in the data file need an open file. */
export function NeedsDocument({ children }: { children: ReactNode }) {
  const ready = useSession((s) => s.status === 'ready');
  if (!ready) return <p className={styles.needsFile}>Open a file to change these settings.</p>;
  return children;
}
