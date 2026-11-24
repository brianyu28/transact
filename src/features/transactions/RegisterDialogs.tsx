import { Button, Group, Modal, TagsInput, Text } from '@mantine/core';
import { useState } from 'react';
import { CategorySelect } from '@/components/CategorySelect/CategorySelect';
import { parseCategoryValue } from '@/components/CategorySelect/categoryValue';
import { sortedTags } from '@/domain/aggregates/lookups';
import { getTransaction } from '@/domain/model';
import type { Id } from '@/domain/schema/types';
import { pluralize } from '@/lib/format';
import { tryRun } from '@/store/actions';
import { useDocStore } from '@/store/docStore';
import { registerStore, useRegister } from './registerStore';
import { SplitEditor } from './SplitEditor';

const close = () => {
  registerStore.setState({ dialog: null });
};

/** Category, tags and split dialogs for the register. */
export function RegisterDialogs() {
  const dialog = useRegister((s) => s.dialog);
  return (
    <>
      <Modal opened={dialog?.kind === 'category'} onClose={close} title="Set category" size="sm">
        {dialog?.kind === 'category' && <CategoryForm ids={dialog.ids} />}
      </Modal>
      <Modal opened={dialog?.kind === 'tags'} onClose={close} title="Tags" size="sm">
        {dialog?.kind === 'tags' && <TagsForm ids={dialog.ids} />}
      </Modal>
      <Modal opened={dialog?.kind === 'split'} onClose={close} title="Split transaction" size="lg">
        {dialog?.kind === 'split' && <SplitEditor id={dialog.id} onDone={close} />}
      </Modal>
    </>
  );
}

function CategoryForm({ ids }: { ids: Id[] }) {
  const doc = useDocStore((s) => s.doc);
  const [value, setValue] = useState('');
  if (!doc) return null;
  const skipped = ids.filter((id) => {
    const t = getTransaction(doc, id);
    return t?.splits !== undefined || t?.transfer !== undefined;
  }).length;

  const apply = (v: string) => {
    const { categoryId } = parseCategoryValue(v);
    if (tryRun('updateTransactions', { ids, changes: { categoryId } })) close();
  };

  return (
    <>
      <CategorySelect
        data-autofocus
        defaultDropdownOpened
        value={value}
        onChange={(v) => {
          setValue(v);
          apply(v);
        }}
        aria-label="Category"
        mb="xs"
      />
      <Text size="xs" c="dimmed">
        Applies to {pluralize(ids.length - skipped, 'transaction')}
        {skipped > 0 && ` (${pluralize(skipped, 'split or transfer')} skipped)`}.
      </Text>
    </>
  );
}

function TagsForm({ ids }: { ids: Id[] }) {
  const doc = useDocStore((s) => s.doc);
  const [add, setAdd] = useState<string[]>([]);
  const [remove, setRemove] = useState<Set<Id>>(new Set());
  if (!doc) return null;

  const present = new Set<Id>();
  for (const id of ids) for (const tag of getTransaction(doc, id)?.tags ?? []) present.add(tag);
  const options = sortedTags(doc)
    .filter((t) => !t.archived)
    .map((t) => t.name);

  const apply = () => {
    if (
      tryRun('updateTransactions', { ids, changes: { addTagNames: add, removeTags: [...remove] } })
    )
      close();
  };

  return (
    <>
      <TagsInput
        data-autofocus
        label="Add tags"
        data={options}
        value={add}
        onChange={setAdd}
        acceptValueOnBlur
        mb="sm"
      />
      {present.size > 0 && (
        <>
          <Text size="sm" fw={500} mb={4}>
            Remove tags
          </Text>
          <Group gap={4} mb="sm">
            {[...present].map((id) => {
              const removing = remove.has(id);
              return (
                <Button
                  key={id}
                  size="compact-xs"
                  variant={removing ? 'filled' : 'light'}
                  color={removing ? 'red' : 'gray'}
                  onClick={() => {
                    const next = new Set(remove);
                    if (removing) next.delete(id);
                    else next.add(id);
                    setRemove(next);
                  }}
                >
                  {doc.tags[id]?.name ?? '?'}
                </Button>
              );
            })}
          </Group>
        </>
      )}
      <Group justify="space-between">
        <Text size="xs" c="dimmed">
          Applies to {pluralize(ids.length, 'transaction')}.
        </Text>
        <Button onClick={apply} disabled={add.length === 0 && remove.size === 0}>
          Apply
        </Button>
      </Group>
    </>
  );
}
