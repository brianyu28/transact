import { SegmentedControl } from '@mantine/core';
import { useState, type ReactNode } from 'react';
import styles from './ReportSection.module.scss';

interface ReportSectionProps {
  title: string;
  subtitle?: ReactNode;
  /** Extra controls next to the chart/table toggle. */
  controls?: ReactNode;
  chart: ReactNode;
  table: ReactNode;
}

/** A report with a Chart/Table toggle: every chart has a table view of the same data. */
export function ReportSection({ title, subtitle, controls, chart, table }: ReportSectionProps) {
  const [view, setView] = useState<'chart' | 'table'>('chart');
  return (
    <section className={styles.root}>
      <header className={styles.header}>
        <div>
          <h2 className={styles.title}>{title}</h2>
          {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
        </div>
        <div className={styles.controls}>
          {controls}
          <SegmentedControl
            size="xs"
            data={[
              { value: 'chart', label: 'Chart' },
              { value: 'table', label: 'Table' },
            ]}
            value={view}
            onChange={(v) => {
              setView(v === 'table' ? 'table' : 'chart');
            }}
            aria-label="View"
          />
        </div>
      </header>
      {view === 'chart' ? chart : <div className={styles.table}>{table}</div>}
    </section>
  );
}
