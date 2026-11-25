import { ActionIcon, Button, Group, Menu, Modal, Select, Text, TextInput } from '@mantine/core';
import { IconArchive, IconDots, IconFolderSymlink, IconPlus, IconTrash } from '@tabler/icons-react';
import { clsx } from 'clsx';
import { useState } from 'react';
import {
  categoryTree,
  usageCounts,
  type CategoryNode,
  type CategoryTree,
} from '@/domain/aggregates/lookups';
import type { Id } from '@/domain/schema/types';
import { InlineEdit } from '@/components/InlineEdit/InlineEdit';
import { DragHandle, SortableGroup, SortableProvider } from '@/components/Sortable/Sortable';
import { useSortableItem } from '@/components/Sortable/useSortableItem';
import { toastWithUndo, tryDispatch, tryRun } from '@/store/actions';
import { useDocStore } from '@/store/docStore';
import { wordFilter } from '@/components/CategorySelect/wordFilter';
import { NeedsDocument } from './NeedsDocument';
import styles from './settings.module.scss';
import local from './CategoriesSettings.module.scss';

export function CategoriesSettings() {
  return (
    <NeedsDocument>
      <CategoriesEditor />
    </NeedsDocument>
  );
}

type Dialog =
  { kind: 'delete' | 'move'; node: CategoryNode } | { kind: 'add'; parentId: Id | null } | null;

function CategoriesEditor() {
  const categories = useDocStore((s) => s.doc?.categories);
  const transactions = useDocStore((s) => s.doc?.transactions);
  const [dialog, setDialog] = useState<Dialog>(null);
  if (!categories || !transactions) return null;

  const tree = categoryTree(categories);
  const usage = usageCounts(transactions).categories;
  const close = () => {
    setDialog(null);
  };

  return (
    <section className={styles.section}>
      <h2 className={styles.heading}>Categories</h2>
      <p className={styles.note}>
        Categories group transactions into types of spending and can be included in budgets.
      </p>
      <div className={local.header}>
        <span />
        <span>Name</span>
        <span>Kind</span>
        <span className={styles.num}>Used</span>
        <span />
      </div>
      <SortableProvider
        onReorder={(group, ids) => {
          tryRun('reorderCategories', { parentId: group === ROOT ? null : group, ids });
        }}
      >
        <CategoryGroup parentId={null} tree={tree} usage={usage} onDialog={setDialog} />
      </SortableProvider>
      <div className={styles.addRow}>
        <Button
          variant="default"
          leftSection={<IconPlus size={14} />}
          onClick={() => {
            setDialog({ kind: 'add', parentId: null });
          }}
        >
          Add category
        </Button>
      </div>

      <AddCategoryDialog dialog={dialog?.kind === 'add' ? dialog : null} onClose={close} />
      <MoveCategoryDialog
        node={dialog?.kind === 'move' ? dialog.node : null}
        nodes={tree.nodes}
        onClose={close}
      />
      <DeleteCategoryDialog
        node={dialog?.kind === 'delete' ? dialog.node : null}
        nodes={tree.nodes}
        usage={dialog?.kind === 'delete' ? (usage.get(dialog.node.category.id) ?? 0) : 0}
        onClose={close}
      />
    </section>
  );
}

const ROOT = '__root';

interface GroupProps {
  parentId: Id | null;
  tree: CategoryTree;
  usage: ReadonlyMap<Id, number>;
  onDialog: (dialog: Dialog) => void;
}

/** One parent's subcategories, independently sortable. */
function CategoryGroup({ parentId, tree, usage, onDialog }: GroupProps) {
  const children = tree.nodes.filter((n) => n.category.parentId === parentId);
  if (children.length === 0) return null;
  return (
    <SortableGroup ids={children.map((n) => n.category.id)}>
      {children.map((node) => (
        <CategoryItem
          key={node.category.id}
          node={node}
          tree={tree}
          usage={usage}
          onDialog={onDialog}
        />
      ))}
    </SortableGroup>
  );
}

/** A category row plus its subcategories; dragging moves the whole block. */
function CategoryItem({
  node,
  tree,
  usage,
  onDialog,
}: Omit<GroupProps, 'parentId'> & { node: CategoryNode }) {
  const c = node.category;
  const { setNodeRef, style, isDragging, handle } = useSortableItem(c.id, c.parentId ?? ROOT);
  return (
    <div ref={setNodeRef} style={style} className={clsx(local.item, isDragging && local.dragging)}>
      <div className={clsx(local.row, c.archived && local.archived)}>
        <DragHandle handle={handle} label={`Reorder ${c.name}`} />
        <span className={local.name} style={{ paddingLeft: node.depth * 18 }}>
          <InlineEdit
            label="Category name"
            value={c.name}
            onCommit={(v) => tryDispatch('updateCategory', { id: c.id, changes: { name: v } })}
          />
          {c.archived && <span className={local.badge}>archived</span>}
        </span>
        <span>
          {c.parentId === null ? (
            <Select
              size="xs"
              variant="unstyled"
              aria-label="Kind"
              data={[
                { value: 'expense', label: 'Expense' },
                { value: 'income', label: 'Income' },
              ]}
              value={node.kind}
              allowDeselect={false}
              onChange={(v) => {
                if (v) tryDispatch('updateCategory', { id: c.id, changes: { kind: v } });
              }}
              w={100}
            />
          ) : (
            <span className={styles.dim}>{node.kind === 'income' ? 'Income' : 'Expense'}</span>
          )}
        </span>
        <span className={clsx(styles.num, styles.dim)}>
          {(usage.get(c.id) ?? 0).toLocaleString()}
        </span>
        <Menu position="bottom-end">
          <Menu.Target>
            <ActionIcon aria-label={`Actions for ${c.name}`} color="gray">
              <IconDots size={14} />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item
              leftSection={<IconPlus size={14} />}
              onClick={() => {
                onDialog({ kind: 'add', parentId: c.id });
              }}
            >
              Add subcategory
            </Menu.Item>
            <Menu.Item
              leftSection={<IconFolderSymlink size={14} />}
              onClick={() => {
                onDialog({ kind: 'move', node });
              }}
            >
              Move to…
            </Menu.Item>
            <Menu.Item
              leftSection={<IconArchive size={14} />}
              onClick={() =>
                tryDispatch('updateCategory', {
                  id: c.id,
                  changes: { archived: c.archived ? undefined : true },
                })
              }
            >
              {c.archived ? 'Unarchive' : 'Archive'}
            </Menu.Item>
            <Menu.Divider />
            <Menu.Item
              color="red"
              leftSection={<IconTrash size={14} />}
              onClick={() => {
                onDialog({ kind: 'delete', node });
              }}
            >
              Delete…
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </div>
      <CategoryGroup parentId={c.id} tree={tree} usage={usage} onDialog={onDialog} />
    </div>
  );
}

function AddCategoryDialog({
  dialog,
  onClose,
}: {
  dialog: { parentId: Id | null } | null;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'expense' | 'income'>('expense');
  const submit = () => {
    if (!dialog || !name.trim()) return;
    const created = tryDispatch('createCategory', {
      name,
      parentId: dialog.parentId,
      ...(dialog.parentId === null ? { kind } : {}),
    });
    if (created) {
      setName('');
      onClose();
    }
  };
  return (
    <Modal
      opened={dialog !== null}
      onClose={onClose}
      title={dialog?.parentId ? 'Add subcategory' : 'Add category'}
      size="sm"
    >
      <TextInput
        data-autofocus
        label="Name"
        value={name}
        onChange={(e) => {
          setName(e.currentTarget.value);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
        }}
        mb="sm"
      />
      {dialog?.parentId === null && (
        <Select
          label="Kind"
          data={[
            { value: 'expense', label: 'Expense' },
            { value: 'income', label: 'Income' },
          ]}
          value={kind}
          allowDeselect={false}
          onChange={(v) => {
            if (v) setKind(v);
          }}
          mb="sm"
        />
      )}
      <Group justify="flex-end">
        <Button onClick={submit} disabled={!name.trim()}>
          Add
        </Button>
      </Group>
    </Modal>
  );
}

function MoveCategoryDialog({
  node,
  nodes,
  onClose,
}: {
  node: CategoryNode | null;
  nodes: readonly CategoryNode[];
  onClose: () => void;
}) {
  const [target, setTarget] = useState<string>('__top');
  if (!node) return <Modal opened={false} onClose={onClose} title="" />;
  const options = [
    { value: '__top', label: '(Top level)' },
    ...nodes
      .filter((n) => !node.subtree.includes(n.category.id))
      .map((n) => ({ value: n.category.id, label: n.path })),
  ];
  return (
    <Modal opened onClose={onClose} title={`Move “${node.category.name}”`} size="sm">
      <Select
        data-autofocus
        label="New parent"
        searchable
        filter={wordFilter}
        data={options}
        value={target}
        allowDeselect={false}
        onChange={(v) => {
          if (v) setTarget(v);
        }}
        mb="sm"
      />
      <Group justify="flex-end">
        <Button
          onClick={() => {
            if (
              tryRun('setCategoryParent', {
                id: node.category.id,
                parentId: target === '__top' ? null : target,
              })
            ) {
              onClose();
            }
          }}
        >
          Move
        </Button>
      </Group>
    </Modal>
  );
}

function DeleteCategoryDialog({
  node,
  nodes,
  usage,
  onClose,
}: {
  node: CategoryNode | null;
  nodes: readonly CategoryNode[];
  usage: number;
  onClose: () => void;
}) {
  const [reassign, setReassign] = useState<string>('__none');
  if (!node) return <Modal opened={false} onClose={onClose} title="" />;
  const options = [
    { value: '__none', label: 'Leave uncategorized' },
    ...nodes
      .filter((n) => n.category.id !== node.category.id)
      .map((n) => ({ value: n.category.id, label: n.path })),
  ];
  const hasChildren = node.subtree.length > 1;
  return (
    <Modal opened onClose={onClose} title={`Delete “${node.category.name}”?`} size="sm">
      <Text size="sm" mb="sm">
        {usage > 0
          ? `${usage.toLocaleString()} transactions use this category.`
          : 'No transactions use this category.'}
        {hasChildren && ' Its subcategories will move up one level.'}
      </Text>
      {usage > 0 && (
        <Select
          label="Move its transactions to"
          searchable
          filter={wordFilter}
          data={options}
          value={reassign}
          allowDeselect={false}
          onChange={(v) => {
            if (v) setReassign(v);
          }}
          mb="sm"
        />
      )}
      <Group justify="flex-end" gap="xs">
        <Button variant="default" onClick={onClose}>
          Cancel
        </Button>
        <Button
          color="red"
          onClick={() => {
            if (
              tryRun('deleteCategory', {
                id: node.category.id,
                reassignTo: reassign === '__none' ? null : reassign,
              })
            ) {
              toastWithUndo(`Deleted ${node.category.name}`);
              onClose();
            }
          }}
        >
          Delete
        </Button>
      </Group>
    </Modal>
  );
}
