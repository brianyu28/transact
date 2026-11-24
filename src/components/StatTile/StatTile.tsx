import { clsx } from 'clsx';
import styles from './StatTile.module.scss';

interface StatTileProps {
  label: string;
  value: string;
  /** Optional signed change, e.g. "+$1,234 in 3M". */
  delta?: { text: string; positive: boolean } | undefined;
  primary?: boolean;
}

/** Headline number with an optional change line. */
export function StatTile({ label, value, delta, primary }: StatTileProps) {
  return (
    <div className={styles.root}>
      <span className={styles.label}>{label}</span>
      <span className={clsx(styles.value, primary && styles.primary)}>{value}</span>
      {delta && (
        <span className={clsx(styles.delta, delta.positive ? styles.up : styles.down)}>
          {delta.text}
        </span>
      )}
    </div>
  );
}
