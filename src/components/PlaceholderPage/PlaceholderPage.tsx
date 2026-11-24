import styles from './PlaceholderPage.module.scss';

interface PlaceholderPageProps {
  /** Short description of what this screen will contain. */
  summary: string;
  /** Plan phase in which the screen is built. */
  phase: number;
}

/** Temporary stand-in for screens that haven't been built yet. */
export function PlaceholderPage({ summary, phase }: PlaceholderPageProps) {
  return (
    <div className={styles.root}>
      <p className={styles.summary}>{summary}</p>
      <p className={styles.phase}>Planned for phase {phase}.</p>
    </div>
  );
}
