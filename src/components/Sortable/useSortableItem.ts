import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { CSSProperties } from 'react';

/** Hook for a sortable item: pass `setNodeRef`/`style` to the moving element, `handle` on the grip. */
export function useSortableItem(id: string, group: string) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, data: { group } });
  const style: CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    position: 'relative',
    zIndex: isDragging ? 2 : undefined,
  };
  return {
    setNodeRef,
    style,
    isDragging,
    handle: { setActivatorNodeRef, ...attributes, ...listeners },
  };
}

export type SortableItem = ReturnType<typeof useSortableItem>;
