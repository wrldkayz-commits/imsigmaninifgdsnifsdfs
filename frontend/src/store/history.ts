/**
 * Undo/redo.
 *
 * Because the project document is immutable, history is just a ring of
 * snapshots — no command objects, no inverse operations to keep in sync with
 * every new feature. The two refinements that matter in practice:
 *
 *  * **Coalescing.** Dragging a widget fires dozens of updates per second.
 *    Entries tagged with the same `mergeKey` inside `MERGE_WINDOW_MS` collapse
 *    into one, so a drag is a single undo step rather than sixty.
 *  * **A bounded stack.** Snapshots of a large design are not free, so the
 *    history is capped and drops from the bottom.
 */

import type { Project } from '@/types/project';

export const HISTORY_LIMIT = 100;
const MERGE_WINDOW_MS = 600;

export interface HistoryEntry {
  project: Project;
  label: string;
  mergeKey?: string;
  at: number;
}

export interface History {
  past: HistoryEntry[];
  future: HistoryEntry[];
}

export const emptyHistory = (): History => ({ past: [], future: [] });

/**
 * Record `previous` as an undo point before applying a change described by
 * `label`. Returns the new history; `future` is always cleared because a fresh
 * edit invalidates any redo branch.
 */
export function pushHistory(
  history: History,
  previous: Project,
  label: string,
  mergeKey?: string,
): History {
  const now = Date.now();
  const last = history.past[history.past.length - 1];

  const shouldMerge =
    mergeKey !== undefined &&
    last !== undefined &&
    last.mergeKey === mergeKey &&
    now - last.at < MERGE_WINDOW_MS;

  if (shouldMerge) {
    // Keep the *older* snapshot — undo should jump to before the whole gesture.
    return {
      past: [...history.past.slice(0, -1), { ...last, at: now }],
      future: [],
    };
  }

  const past = [...history.past, { project: previous, label, mergeKey, at: now }];
  return {
    past: past.length > HISTORY_LIMIT ? past.slice(past.length - HISTORY_LIMIT) : past,
    future: [],
  };
}

export function undo(
  history: History,
  current: Project,
): { history: History; project: Project; label: string } | null {
  const entry = history.past[history.past.length - 1];
  if (!entry) return null;

  return {
    history: {
      past: history.past.slice(0, -1),
      future: [...history.future, { ...entry, project: current }],
    },
    project: entry.project,
    label: entry.label,
  };
}

export function redo(
  history: History,
  current: Project,
): { history: History; project: Project; label: string } | null {
  const entry = history.future[history.future.length - 1];
  if (!entry) return null;

  return {
    history: {
      past: [...history.past, { ...entry, project: current }],
      future: history.future.slice(0, -1),
    },
    project: entry.project,
    label: entry.label,
  };
}
