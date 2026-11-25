import { CURRENT_SCHEMA_VERSION } from '@/domain/schema/version';
import { countTransactions } from '@/domain/model';
import { displayFileName, formatBytes, formatRelativeTime, pluralize } from '@/lib/format';
import { useDocStore } from '@/store/docStore';
import { useSession } from '@/store/sessionStore';
import styles from './settings.module.scss';

const { commit, commitDate, builtAt } = __BUILD_INFO__;

function dateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

/** Which build of the app is running, and facts about the open file. */
export function AboutSettings() {
  const hasDocument = useSession((s) => s.status === 'ready');
  const source = useSession((s) => s.source);
  const fileSize = useSession((s) => s.fileSize);
  const transactions = useDocStore((s) => s.doc?.transactions);
  const count = transactions ? countTransactions({ transactions }) : 0;

  return (
    <>
      <section className={styles.section}>
        <h2 className={styles.heading}>App</h2>
        <dl className={styles.facts}>
          <dt>Last updated</dt>
          <dd>
            {commitDate ? (
              <>
                {dateTime(commitDate)}{' '}
                <span className={styles.dim}>({formatRelativeTime(commitDate)})</span>
              </>
            ) : (
              'Unknown'
            )}
          </dd>
          <dt>Commit</dt>
          <dd className={styles.mono}>{commit ? commit.slice(0, 7) : 'Unknown'}</dd>
          <dt>Built</dt>
          <dd>{dateTime(builtAt)}</dd>
        </dl>
      </section>
      <section className={styles.section}>
        <h2 className={styles.heading}>File</h2>
        {hasDocument ? (
          <dl className={styles.facts}>
            <dt>Name</dt>
            <dd>{source ? displayFileName(source.name) : 'Not saved yet'}</dd>
            <dt>Size</dt>
            <dd>{fileSize === null ? '—' : formatBytes(fileSize)}</dd>
            <dt>Transactions</dt>
            <dd>{pluralize(count, 'transaction')}</dd>
            <dt>Format</dt>
            <dd>Version {CURRENT_SCHEMA_VERSION}</dd>
          </dl>
        ) : (
          <p className={styles.note}>No file open.</p>
        )}
      </section>
    </>
  );
}
