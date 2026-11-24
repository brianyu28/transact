/**
 * Thin wrappers around dnd-kit for vertical drag-and-drop reordering. Items are dragged
 * by a handle (so clicks elsewhere in the row still work) and can also be moved with the
 * keyboard: focus the handle, press Space, use the arrow keys, Space again to drop.
 */
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type Modifier,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { IconGripVertical } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import type { SortableItem } from './useSortableItem';
import styles from './Sortable.module.scss';

const verticalOnly: Modifier = ({ transform }) => ({ ...transform, x: 0 });

/** Only items in the same group (e.g. siblings under one parent) are drop targets. */
const sameGroupCollision: CollisionDetection = (args) => {
  const group = args.active.data.current?.group as unknown;
  return closestCenter({
    ...args,
    droppableContainers: args.droppableContainers.filter((c) => c.data.current?.group === group),
  });
};

interface SortableProviderProps {
  /** Called with the group and its ids in their new order. */
  onReorder: (group: string, ids: string[]) => void;
  children: ReactNode;
}

/** One provider per screen; nest a `SortableGroup` for each independently ordered list. */
export function SortableProvider({ onReorder, children }: SortableProviderProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const group = active.data.current?.group as string | undefined;
    const sortable = (active.data.current as { sortable?: { items: string[] } } | undefined)
      ?.sortable;
    const ids = sortable?.items;
    if (group === undefined || !ids || over.data.current?.group !== group) return;
    onReorder(group, arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id))));
  };
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={sameGroupCollision}
      modifiers={[verticalOnly]}
      onDragEnd={onDragEnd}
    >
      {children}
    </DndContext>
  );
}

export function SortableGroup({ ids, children }: { ids: string[]; children: ReactNode }) {
  return (
    <SortableContext items={ids} strategy={verticalListSortingStrategy}>
      {children}
    </SortableContext>
  );
}

type HandleProps = SortableItem['handle'];

export function DragHandle({ handle, label }: { handle: HandleProps; label: string }) {
  const { setActivatorNodeRef, ...rest } = handle;
  return (
    <button
      type="button"
      ref={setActivatorNodeRef}
      className={styles.handle}
      aria-label={label}
      {...rest}
    >
      <IconGripVertical size={14} />
    </button>
  );
}
