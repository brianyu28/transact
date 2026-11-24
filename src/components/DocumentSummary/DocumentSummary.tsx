import { pluralize } from '@/lib/format';
import { countTransactions } from '@/domain/model';
import { useDocStore } from '@/store/docStore';
import styles from './DocumentSummary.module.scss';

/** One-line overview of the open document's contents. */
export function DocumentSummary() {
  const doc = useDocStore((s) => s.doc);
  if (!doc) return null;
  const count = (m: object) => Object.keys(m).length;
  return (
    <p className={styles.root}>
      {[
        pluralize(count(doc.accounts), 'account'),
        pluralize(countTransactions(doc), 'transaction'),
        pluralize(count(doc.categories), 'category', 'categories'),
        pluralize(count(doc.tags), 'tag'),
        `revision ${doc.meta.revision}`,
      ].join(' · ')}
    </p>
  );
}
