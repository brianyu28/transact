/** Runs a compiled filter against the document, using the index to narrow candidates. */
import { idFromKey, type DocIndex } from '../aggregates/docIndex';
import { getTransaction, type DocModel } from '../model';
import type { Id } from '../schema/types';
import type { CompiledFilter } from './filter';

/** Lower bound in a sorted key array (see `sortKey`). */
function lowerBound(keys: readonly string[], key: string): number {
  let lo = 0;
  let hi = keys.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if ((keys[mid] as string) < key) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Matching transaction ids, newest first. */
export function runFilter(
  doc: Pick<DocModel, 'transactions'>,
  index: DocIndex,
  filter: CompiledFilter,
): Id[] {
  const sources: (readonly string[])[] = filter.accountIds
    ? [...filter.accountIds].map((id) => index.byAccount.get(id) ?? [])
    : [index.byDate];
  const from = filter.dateRange ? `${filter.dateRange.from}|` : '';
  const to = filter.dateRange ? `${filter.dateRange.to}|￿` : '￿';

  const keys: string[] = [];
  for (const source of sources) {
    const end = lowerBound(source, to);
    for (let i = lowerBound(source, from); i < end; i++) {
      const key = source[i] as string;
      const t = getTransaction(doc, idFromKey(key));
      if (t && filter.test(t)) keys.push(key);
    }
  }
  if (sources.length > 1) keys.sort();
  const ids: Id[] = new Array<Id>(keys.length);
  for (let i = 0; i < keys.length; i++) ids[i] = idFromKey(keys[keys.length - 1 - i] as string);
  return ids;
}
