import { Anchor, Breadcrumbs } from '@mantine/core';
import { clsx } from 'clsx';
import { useMemo, useState } from 'react';
import { categoryTree } from '@/domain/aggregates/lookups';
import { categoryBreakdown, GENERAL } from '@/domain/reports/reports';
import type { Id } from '@/domain/schema/types';
import { UNCATEGORIZED } from '@/domain/aggregates/docIndex';
import { useFormat } from '@/hooks/useFormat';
import type { MonthKey } from '@/lib/date';
import { ReportSection } from './ReportSection';
import { useReportDeps } from './useReportDeps';
import styles from './CategoryReport.module.scss';
import t from './reportTable.module.scss';

/** Where the money went: categories ranked by spending, with change vs. the previous period. */
export function CategoryReport({ months }: { months: MonthKey[] }) {
  const { index, indexVersion, categories } = useReportDeps();
  const [parentId, setParentId] = useState<Id | null>(null);
  const format = useFormat();

  const data = useMemo(
    () => (index && categories ? categoryBreakdown({ categories }, index, months, parentId) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- indexVersion tracks in-place index changes.
    [index, indexVersion, categories, months, parentId],
  );
  if (!data || !categories) return null;
  const tree = categoryTree(categories);
  const max = Math.max(1, ...data.rows.map((r) => r.total));
  const parentName = parentId ? tree.byId.get(parentId)?.category.name : undefined;
  const ancestors: { id: Id; name: string }[] = [];
  for (let id = parentId; id; id = tree.byId.get(id)?.category.parentId ?? null) {
    ancestors.unshift({ id, name: tree.byId.get(id)?.category.name ?? '' });
  }
  const drillable = (key: Id) => key !== UNCATEGORIZED && key !== GENERAL;

  const delta = (current: number, previous: number) => {
    if (previous === 0) return <span className={t.dim}>new</span>;
    const d = current - previous;
    const pct = Math.round((d / previous) * 100);
    return (
      <span className={d > 0 ? t.up : d < 0 ? t.down : t.dim}>
        {d === 0 ? '—' : `${format.money(d, { sign: 'always' })} (${pct > 0 ? '+' : ''}${pct}%)`}
      </span>
    );
  };

  const rows = data.rows.map((r) => (
    <tr key={r.key}>
      <td>
        {r.hasChildren && drillable(r.key) ? (
          <Anchor
            component="button"
            size="sm"
            onClick={() => {
              setParentId(r.key);
            }}
          >
            {r.label} ›
          </Anchor>
        ) : (
          r.label
        )}
      </td>
      <td className={styles.barCell}>
        <span className={styles.bar} style={{ width: `${Math.max(0, (r.total / max) * 100)}%` }} />
      </td>
      <td>{format.money(r.total)}</td>
      <td className={t.dim}>{Math.round(r.share * 100)}%</td>
      <td>{delta(r.total, r.previous)}</td>
    </tr>
  ));

  return (
    <ReportSection
      title={parentName ? `${parentName} spending` : 'Spending by category'}
      subtitle={
        <>
          {format.money(data.total)} total · {delta(data.total, data.previousTotal)} vs. the
          previous {months.length} {months.length === 1 ? 'month' : 'months'}
        </>
      }
      controls={
        parentId && (
          <Breadcrumbs separator="›" className={styles.crumbs}>
            <Anchor
              component="button"
              size="xs"
              onClick={() => {
                setParentId(null);
              }}
            >
              All
            </Anchor>
            {ancestors.map((a) => (
              <Anchor
                key={a.id}
                component="button"
                size="xs"
                onClick={() => {
                  setParentId(a.id);
                }}
              >
                {a.name}
              </Anchor>
            ))}
          </Breadcrumbs>
        )
      }
      chart={
        <table className={clsx(t.table, styles.breakdown)}>
          <thead>
            <tr>
              <th>Category</th>
              <th aria-label="Share" />
              <th>Spent</th>
              <th>Share</th>
              <th>vs. previous</th>
            </tr>
          </thead>
          <tbody>{rows}</tbody>
        </table>
      }
      table={
        <table className={t.table}>
          <thead>
            <tr>
              <th>Category</th>
              <th>Spent</th>
              <th>Share</th>
              <th>Previous period</th>
              <th>Change</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => (
              <tr key={r.key}>
                <td>{r.label}</td>
                <td>{format.money(r.total)}</td>
                <td>{(r.share * 100).toFixed(1)}%</td>
                <td>{format.money(r.previous)}</td>
                <td>{delta(r.total, r.previous)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    />
  );
}
