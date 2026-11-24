import { Fragment } from 'react';
import { comboCaps, normalizeBinding } from '@/keyboard/keys';
import styles from './KeyBinding.module.scss';

/** Renders a key binding as key caps, e.g. "g t" → [G] then [T]. */
export function KeyBinding({ binding }: { binding: string }) {
  const combos = normalizeBinding(binding).split(' ');
  return (
    <span className={styles.root}>
      {combos.map((combo, i) => (
        <Fragment key={i}>
          {i > 0 && <span className={styles.then}>then</span>}
          {comboCaps(combo).map((cap, j) => (
            <kbd key={j} className={styles.cap}>
              {cap}
            </kbd>
          ))}
        </Fragment>
      ))}
    </span>
  );
}
