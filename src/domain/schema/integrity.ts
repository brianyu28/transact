/**
 * Cross-reference checks that a structural schema can't express: dangling references,
 * duplicate ids, broken transfer links. Issues are reported (not fatal) so a slightly
 * damaged file can still be opened and repaired.
 */
import type { TransactFile } from './types';

export interface IntegrityIssue {
  entityId: string;
  message: string;
}

export function checkIntegrity(file: TransactFile): IntegrityIssue[] {
  const issues: IntegrityIssue[] = [];
  const seen = new Set<string>();
  const ids = (items: readonly { id: string }[]) => {
    const set = new Set<string>();
    for (const item of items) {
      if (seen.has(item.id)) issues.push({ entityId: item.id, message: 'Duplicate id' });
      seen.add(item.id);
      set.add(item.id);
    }
    return set;
  };

  const accounts = ids(file.accounts);
  const categories = ids(file.categories);
  const tags = ids(file.tags);
  const transactions = new Map(file.transactions.map((t) => [t.id, t]));
  ids(file.transactions);
  const statements = ids(file.statements);

  for (const c of file.categories) {
    if (c.parentId !== null && !categories.has(c.parentId)) {
      issues.push({ entityId: c.id, message: `Unknown parent category ${c.parentId}` });
    }
  }
  // Category cycles would make tree walks loop forever.
  const parent = new Map(file.categories.map((c) => [c.id, c.parentId]));
  for (const c of file.categories) {
    let cursor: string | null | undefined = c.parentId;
    for (let depth = 0; cursor; depth++) {
      if (cursor === c.id || depth > file.categories.length) {
        issues.push({ entityId: c.id, message: 'Category hierarchy contains a cycle' });
        break;
      }
      cursor = parent.get(cursor);
    }
  }

  const checkCategory = (ownerId: string, id: string | undefined) => {
    if (id !== undefined && !categories.has(id)) {
      issues.push({ entityId: ownerId, message: `Unknown category ${id}` });
    }
  };
  const checkTags = (ownerId: string, list: readonly string[] | undefined) => {
    for (const id of list ?? []) {
      if (!tags.has(id)) issues.push({ entityId: ownerId, message: `Unknown tag ${id}` });
    }
  };

  for (const t of file.transactions) {
    if (!accounts.has(t.accountId))
      issues.push({ entityId: t.id, message: `Unknown account ${t.accountId}` });
    checkCategory(t.id, t.categoryId);
    checkTags(t.id, t.tags);
    for (const s of t.splits ?? []) {
      checkCategory(t.id, s.categoryId);
      checkTags(t.id, s.tags);
    }
    if (t.statementId !== undefined && !statements.has(t.statementId)) {
      issues.push({ entityId: t.id, message: `Unknown statement ${t.statementId}` });
    }
    if (t.transfer) {
      const peer = transactions.get(t.transfer.peerId);
      if (!peer) issues.push({ entityId: t.id, message: 'Transfer peer is missing' });
      else if (peer.transfer?.peerId !== t.id)
        issues.push({ entityId: t.id, message: 'Transfer peer does not link back' });
    }
  }

  for (const s of [...file.balanceSnapshots, ...file.statements]) {
    if (!accounts.has(s.accountId))
      issues.push({ entityId: s.id, message: `Unknown account ${s.accountId}` });
  }
  return issues;
}
