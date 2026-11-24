import { ActionIcon, Button, Menu, TextInput } from '@mantine/core';
import { IconArchive, IconDots, IconPlus, IconTrash } from '@tabler/icons-react';
import { clsx } from 'clsx';
import { useState } from 'react';
import { sortedTags, usageCounts } from '@/domain/aggregates/lookups';
import { InlineEdit } from '@/components/InlineEdit/InlineEdit';
import { toastWithUndo, tryDispatch, tryRun } from '@/store/actions';
import { useDocStore } from '@/store/docStore';
import { NeedsDocument } from './NeedsDocument';
import styles from './settings.module.scss';

export function TagsSettings() {
  return (
    <NeedsDocument>
      <TagsEditor />
    </NeedsDocument>
  );
}

function TagsEditor() {
  const tags = useDocStore((s) => s.doc?.tags);
  const transactions = useDocStore((s) => s.doc?.transactions);
  const [name, setName] = useState('');
  if (!tags || !transactions) return null;
  const usage = usageCounts(transactions).tags;

  const add = () => {
    if (name.trim() && tryDispatch('createTag', { name })) setName('');
  };

  return (
    <section className={styles.section}>
      <h2 className={styles.heading}>Tags</h2>
      <p className={styles.note}>
        Tags group transactions across categories, for example everything from one trip. Custom
        budgets are defined by tags.
      </p>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Name</th>
            <th className={styles.num}>Used</th>
            <th className={styles.actions} aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {sortedTags({ tags }).map((t) => {
            const count = usage.get(t.id) ?? 0;
            return (
              <tr key={t.id} className={clsx(t.archived && styles.dim)}>
                <td>
                  <InlineEdit
                    label="Tag name"
                    value={t.name}
                    onCommit={(v) => tryDispatch('updateTag', { id: t.id, changes: { name: v } })}
                  />
                  {t.archived && <span className={styles.dim}> (archived)</span>}
                </td>
                <td className={clsx(styles.num, styles.dim)}>{count.toLocaleString()}</td>
                <td className={styles.actions}>
                  <Menu position="bottom-end">
                    <Menu.Target>
                      <ActionIcon aria-label={`Actions for ${t.name}`} color="gray">
                        <IconDots size={14} />
                      </ActionIcon>
                    </Menu.Target>
                    <Menu.Dropdown>
                      <Menu.Item
                        leftSection={<IconArchive size={14} />}
                        onClick={() =>
                          tryDispatch('updateTag', {
                            id: t.id,
                            changes: { archived: t.archived ? undefined : true },
                          })
                        }
                      >
                        {t.archived ? 'Unarchive' : 'Archive (hide from pickers)'}
                      </Menu.Item>
                      <Menu.Divider />
                      <Menu.Item
                        color="red"
                        leftSection={<IconTrash size={14} />}
                        onClick={() => {
                          if (tryRun('deleteTag', { id: t.id })) {
                            toastWithUndo(
                              count > 0
                                ? `Deleted ${t.name} from ${count.toLocaleString()} transactions`
                                : `Deleted ${t.name}`,
                            );
                          }
                        }}
                      >
                        Delete
                      </Menu.Item>
                    </Menu.Dropdown>
                  </Menu>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className={styles.addRow}>
        <TextInput
          placeholder="New tag"
          aria-label="New tag name"
          value={name}
          onChange={(e) => {
            setName(e.currentTarget.value);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') add();
          }}
          w={220}
        />
        <Button leftSection={<IconPlus size={14} />} onClick={add} disabled={!name.trim()}>
          Add tag
        </Button>
      </div>
    </section>
  );
}
