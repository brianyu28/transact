import { ActionIcon, Button, Menu, Select, TextInput } from '@mantine/core';
import { IconDots, IconPlus, IconTrash } from '@tabler/icons-react';
import { clsx } from 'clsx';
import { useState } from 'react';
import { sortedAccounts, usageCounts } from '@/domain/aggregates/lookups';
import type { Account, AccountType } from '@/domain/schema/types';
import { InlineEdit } from '@/components/InlineEdit/InlineEdit';
import { DragHandle, SortableGroup, SortableProvider } from '@/components/Sortable/Sortable';
import { useSortableItem } from '@/components/Sortable/useSortableItem';
import { toastWithUndo, tryDispatch, tryRun } from '@/store/actions';
import { useDocStore } from '@/store/docStore';
import { ACCOUNT_TYPE_OPTIONS } from './accountTypes';
import { NeedsDocument } from './NeedsDocument';
import styles from './settings.module.scss';

export function AccountsSettings() {
  return (
    <NeedsDocument>
      <AccountsEditor />
    </NeedsDocument>
  );
}

function AccountsEditor() {
  const accounts = useDocStore((s) => s.doc?.accounts);
  const transactions = useDocStore((s) => s.doc?.transactions);
  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>('checking');
  if (!accounts || !transactions) return null;

  const usage = usageCounts(transactions).accounts;
  const list = sortedAccounts({ accounts });

  const add = () => {
    if (!name.trim()) return;
    if (tryDispatch('createAccount', { name, type })) setName('');
  };

  return (
    <section className={styles.section}>
      <h2 className={styles.heading}>Accounts</h2>
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.grip} aria-label="Reorder" />
            <th>Name</th>
            <th>Type</th>
            <th>Institution</th>
            <th className={styles.num}>Transactions</th>
            <th>Status</th>
            <th className={styles.actions} aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          <SortableProvider
            onReorder={(_, ids) => {
              tryRun('reorderAccounts', { ids });
            }}
          >
            <SortableGroup ids={list.map((a) => a.id)}>
              {list.map((a) => (
                <AccountRow key={a.id} account={a} count={usage.get(a.id) ?? 0} />
              ))}
            </SortableGroup>
          </SortableProvider>
        </tbody>
      </table>
      <div className={styles.addRow}>
        <TextInput
          placeholder="New account name"
          aria-label="New account name"
          value={name}
          onChange={(e) => {
            setName(e.currentTarget.value);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') add();
          }}
          w={220}
        />
        <Select
          aria-label="New account type"
          data={ACCOUNT_TYPE_OPTIONS}
          value={type}
          allowDeselect={false}
          onChange={(v) => {
            if (v) setType(v as AccountType);
          }}
          w={140}
        />
        <Button leftSection={<IconPlus size={14} />} onClick={add} disabled={!name.trim()}>
          Add account
        </Button>
      </div>
      <p className={styles.note}>
        Credit cards and loans are liabilities: their balances are negative when you owe money.
      </p>
    </section>
  );
}

function AccountRow({ account: a, count }: { account: Account; count: number }) {
  const { setNodeRef, style, isDragging, handle } = useSortableItem(a.id, 'accounts');
  return (
    <tr ref={setNodeRef} style={style} className={clsx(isDragging && styles.dragging)}>
      <td className={styles.grip}>
        <DragHandle handle={handle} label={`Reorder ${a.name}`} />
      </td>
      <td>
        <InlineEdit
          label="Account name"
          value={a.name}
          onCommit={(v) => tryDispatch('updateAccount', { id: a.id, changes: { name: v } })}
        />
      </td>
      <td>
        <Select
          size="xs"
          variant="unstyled"
          aria-label="Account type"
          data={ACCOUNT_TYPE_OPTIONS}
          value={a.type}
          allowDeselect={false}
          onChange={(v) => {
            if (v)
              tryDispatch('updateAccount', {
                id: a.id,
                changes: { type: v as AccountType },
              });
          }}
          w={130}
        />
      </td>
      <td>
        <InlineEdit
          label="Institution"
          value={a.institution ?? '—'}
          onCommit={(v) =>
            tryDispatch('updateAccount', {
              id: a.id,
              changes: { institution: v === '—' ? '' : v },
            })
          }
          className={a.institution ? undefined : styles.dim}
        />
      </td>
      <td className={styles.num}>{count.toLocaleString()}</td>
      <td className={a.closed ? styles.dim : undefined}>{a.closed ? 'Closed' : 'Open'}</td>
      <td className={styles.actions}>
        <Menu position="bottom-end">
          <Menu.Target>
            <ActionIcon aria-label={`Actions for ${a.name}`} color="gray">
              <IconDots size={14} />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item
              onClick={() =>
                tryDispatch('updateAccount', {
                  id: a.id,
                  changes: { closed: a.closed ? undefined : true },
                })
              }
            >
              {a.closed ? 'Reopen account' : 'Close account'}
            </Menu.Item>
            <Menu.Divider />
            <Menu.Item
              color="red"
              leftSection={<IconTrash size={14} />}
              disabled={count > 0}
              onClick={() => {
                if (tryRun('deleteAccount', { id: a.id })) {
                  toastWithUndo(`Deleted ${a.name}`);
                }
              }}
            >
              Delete{count > 0 ? ' (has transactions)' : ''}
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </td>
    </tr>
  );
}
