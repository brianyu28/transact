/**
 * The open document, its indexes, and undo/redo history.
 *
 * All edits go through `dispatch(commandName, payload)`. Each command runs inside
 * Immer's `produceWithPatches`; the patches drive undo/redo and tell the index exactly
 * which transactions changed, so indexes update incrementally.
 */
import {
  applyPatches,
  enablePatches,
  produce,
  produceWithPatches,
  type Draft,
  type Patch,
} from 'immer';
import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import { DocIndex } from '@/domain/aggregates/docIndex';
import {
  commands,
  type CommandName,
  type CommandPayload,
  type CommandResult,
} from '@/domain/commands';
import { getTransaction, type DocModel } from '@/domain/model';
import type { Id } from '@/domain/schema/types';
import { newId } from '@/lib/id';

enablePatches();

const MAX_HISTORY = 200;

interface HistoryEntry {
  label: string;
  /** `contentId` of the document after this step. */
  contentId: number;
  patches: Patch[];
  inverse: Patch[];
}

export interface DocState {
  doc: DocModel | null;
  index: DocIndex | null;
  /** Changes whenever the index changes; subscribe to this to recompute derived data. */
  indexVersion: number;
  /** Incremented by every edit, undo and redo. */
  editSeq: number;
  /**
   * Identity of the document's current content: each undo history step has its own, so
   * undoing back to a state restores its id.
   */
  contentId: number;
  /** `contentId` of what was last saved (or loaded); null when no state matches the file. */
  savedContentId: number | null;
  undoLabel: string | null;
  redoLabel: string | null;
}

export interface DocActions {
  load(doc: DocModel, options?: { dirty?: boolean }): void;
  unload(): void;
  dispatch<K extends CommandName>(name: K, payload: CommandPayload<K>): CommandResult<K>;
  undo(): void;
  redo(): void;
  /** Non-undoable metadata update (e.g. revision bump on save). */
  updateMeta(recipe: (meta: Draft<DocModel['meta']>) => void): void;
  /** Records that the content with this id (`contentId` when the save started) was saved. */
  markSaved(contentId: number): void;
  /** Marks the document as having unsaved changes (e.g. after turning on encryption). */
  markDirty(): void;
}

export type DocStore = DocState & DocActions;

const emptyState: DocState = {
  doc: null,
  index: null,
  indexVersion: 0,
  editSeq: 0,
  contentId: 0,
  savedContentId: 0,
  undoLabel: null,
  redoLabel: null,
};

/**
 * Ids of transactions touched by a set of patches (paths look like
 * ['transactions', bucket, id, ...]), or 'all' if the whole collection was replaced.
 */
function touchedTransactions(
  patches: readonly Patch[],
  prev: DocModel,
  next: DocModel,
): Set<Id> | 'all' {
  const ids = new Set<Id>();
  for (const p of patches) {
    if (p.path[0] !== 'transactions') continue;
    if (p.path.length < 2) return 'all';
    if (p.path.length === 2) {
      // A whole bucket was added, removed or replaced.
      const bucket = String(p.path[1]);
      for (const id of Object.keys(prev.transactions[bucket] ?? {})) ids.add(id);
      for (const id of Object.keys(next.transactions[bucket] ?? {})) ids.add(id);
    } else {
      ids.add(String(p.path[2]));
    }
  }
  return ids;
}

export function createDocStore() {
  let past: HistoryEntry[] = [];
  let future: HistoryEntry[] = [];
  /** `contentId` of the document as loaded, before any history step. */
  let rootContentId = 0;
  let nextContentId = 1;

  return createStore<DocStore>()((set, get) => {
    /** Commits a new document version and updates the index from the patches. */
    const commit = (next: DocModel, patches: readonly Patch[], history: Partial<DocState> = {}) => {
      const { doc: prev, index } = get();
      if (!prev || !index) return;
      const touched = touchedTransactions(patches, prev, next);
      let nextIndex = index;
      if (touched === 'all') {
        nextIndex = DocIndex.build(next);
      } else {
        for (const id of touched) index.update(getTransaction(prev, id), getTransaction(next, id));
      }
      set((s) => ({
        doc: next,
        index: nextIndex,
        indexVersion: touched === 'all' || touched.size > 0 ? s.indexVersion + 1 : s.indexVersion,
        editSeq: s.editSeq + 1,
        contentId: past.at(-1)?.contentId ?? rootContentId,
        undoLabel: past.at(-1)?.label ?? null,
        redoLabel: future.at(-1)?.label ?? null,
        ...history,
      }));
    };

    return {
      ...emptyState,

      load(doc, options) {
        past = [];
        future = [];
        rootContentId = nextContentId++;
        set({
          ...emptyState,
          doc,
          index: DocIndex.build(doc),
          indexVersion: get().indexVersion + 1,
          editSeq: get().editSeq + 1,
          contentId: rootContentId,
          // A loaded document that already differs from its file (migrated, merged…) stays
          // unsaved however far back it is undone.
          savedContentId: options?.dirty ? null : rootContentId,
        });
      },

      unload() {
        past = [];
        future = [];
        set({ ...emptyState, editSeq: get().editSeq + 1, indexVersion: get().indexVersion + 1 });
      },

      dispatch(name, payload) {
        const doc = get().doc;
        if (!doc) throw new Error('No document is open');
        const command = commands[name];
        const ctx = { now: new Date().toISOString(), newId };
        let result: unknown;
        const [next, patches, inverse] = produceWithPatches(doc, (draft) => {
          // The run function's payload type is checked at the dispatch call site.
          result = (command.run as (d: Draft<DocModel>, p: unknown, c: typeof ctx) => unknown)(
            draft,
            payload,
            ctx,
          );
        });
        if (patches.length > 0) {
          past.push({ label: command.label, contentId: nextContentId++, patches, inverse });
          // Dropping the oldest step makes the state after it the bottom of the history.
          if (past.length > MAX_HISTORY) rootContentId = past.shift()?.contentId ?? rootContentId;
          future = [];
          commit(next, patches);
        }
        return result as CommandResult<typeof name>;
      },

      undo() {
        const doc = get().doc;
        const entry = past.pop();
        if (!doc || !entry) return;
        future.push(entry);
        commit(applyPatches(doc, entry.inverse), entry.inverse);
      },

      redo() {
        const doc = get().doc;
        const entry = future.pop();
        if (!doc || !entry) return;
        past.push(entry);
        commit(applyPatches(doc, entry.patches), entry.patches);
      },

      updateMeta(recipe) {
        const doc = get().doc;
        if (!doc) return;
        set({
          doc: produce(doc, (d) => {
            recipe(d.meta);
          }),
        });
      },

      markSaved(contentId) {
        set({ savedContentId: contentId });
      },

      markDirty() {
        // The file no longer matches any state in the history (e.g. encryption changed).
        set((s) => ({ editSeq: s.editSeq + 1, savedContentId: null }));
      },
    };
  });
}

/** The app's single document store. */
export const docStore = createDocStore();

export function useDocStore<T>(selector: (state: DocStore) => T): T {
  return useStore(docStore, selector);
}

export const selectIsDirty = (s: DocState) => s.doc !== null && s.contentId !== s.savedContentId;
