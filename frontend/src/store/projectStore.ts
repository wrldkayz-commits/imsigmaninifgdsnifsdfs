/**
 * The document store: the project, the selection, and every mutation.
 *
 * One store owns the document so undo/redo has a single source of truth. UI-only
 * state (zoom, panel visibility, theme) lives in `uiStore` — mixing them would
 * put "I scrolled the canvas" onto the undo stack.
 */

import { useMemo } from 'react';
import { create } from 'zustand';
import type { WidgetSpec } from '@/types/catalog';
import type { Point, Project, ThemeSpec, Widget, WindowSpec } from '@/types/project';
import { createEmptyProject } from '@/types/project';
import {
  ancestorsOf,
  findParent,
  findWidget,
  insertWidgets,
  isAncestor,
  removeWidgets,
  reorderChild,
  topLevelOf,
  updateWidget,
  updateWidgets,
  walk,
} from '@/lib/tree';
import { cloneWidget, createWidget } from '@/lib/widgetFactory';
import {
  alignDeltas,
  collectRects,
  distributeDeltas,
  type AlignMode,
  type Rect,
} from '@/lib/geometry';
import { emptyHistory, pushHistory, redo, undo, type History } from './history';

interface ProjectState {
  project: Project;
  history: History;
  selection: string[];
  /** Bumped on every document change so effects can cheaply detect edits. */
  revision: number;
  dirty: boolean;
  filePath: string | null;
  lastAction: string;
}

interface ProjectActions {
  // -- document ---------------------------------------------------------------
  newProject: (name?: string) => void;
  loadProject: (project: Project, filePath?: string | null) => void;
  markSaved: (filePath?: string | null) => void;
  setProjectMeta: (patch: Partial<Project['project']>) => void;
  setWindow: (patch: Partial<WindowSpec>) => void;
  setTheme: (theme: ThemeSpec) => void;

  // -- selection --------------------------------------------------------------
  select: (ids: string[]) => void;
  toggleSelect: (id: string) => void;
  selectAll: () => void;
  clearSelection: () => void;

  // -- widgets ----------------------------------------------------------------
  addWidget: (spec: WidgetSpec, parentId: string | null, position: Point) => string;
  updateWidgetById: (
    id: string,
    updater: (widget: Widget) => Widget,
    options?: { label?: string; mergeKey?: string },
  ) => void;
  updateSelected: (
    updater: (widget: Widget) => Widget,
    options?: { label?: string; mergeKey?: string },
  ) => void;
  moveSelectedBy: (dx: number, dy: number, mergeKey?: string) => void;
  deleteSelected: () => void;
  duplicateSelected: () => void;
  paste: (widgets: Widget[], parentId: string | null, offset?: Point) => void;
  reparent: (ids: string[], parentId: string | null, index?: number) => void;
  reorder: (id: string, direction: 'front' | 'back' | 'forward' | 'backward') => void;
  group: () => void;
  ungroup: () => void;
  setLocked: (ids: string[], locked: boolean) => void;
  setVisible: (ids: string[], visible: boolean) => void;
  align: (mode: AlignMode) => void;
  distribute: (axis: 'horizontal' | 'vertical') => void;

  // -- history ----------------------------------------------------------------
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
}

export type ProjectStore = ProjectState & ProjectActions;

const initialProject = createEmptyProject();

export const useProjectStore = create<ProjectStore>((set, get) => {
  /**
   * The one path through which the document changes. Centralising it means
   * history, the dirty flag and the revision counter can never drift out of
   * sync with the document — a class of bug that is otherwise endemic in
   * editors like this.
   */
  const commit = (
    mutate: (project: Project) => Project,
    label: string,
    mergeKey?: string,
  ): void => {
    const state = get();
    const next = mutate(state.project);
    if (next === state.project) return;

    set({
      project: next,
      history: pushHistory(state.history, state.project, label, mergeKey),
      revision: state.revision + 1,
      dirty: true,
      lastAction: label,
    });
  };

  const withWidgets = (project: Project, widgets: Widget[]): Project =>
    widgets === project.widgets ? project : { ...project, widgets };

  /** Selected ids minus any whose ancestor is also selected. */
  const movableSelection = (): string[] => {
    const { project, selection } = get();
    return topLevelOf(project.widgets, selection).filter((id) => {
      const widget = findWidget(project.widgets, id);
      return widget !== null && !widget.behavior.locked && widget.type !== 'window';
    });
  };

  return {
    project: initialProject,
    history: emptyHistory(),
    selection: [],
    revision: 0,
    dirty: false,
    filePath: null,
    lastAction: 'New project',

    // -- document -------------------------------------------------------------

    newProject: (name = 'Untitled Project') =>
      set({
        project: createEmptyProject(name),
        history: emptyHistory(),
        selection: [],
        revision: get().revision + 1,
        dirty: false,
        filePath: null,
        lastAction: 'New project',
      }),

    loadProject: (project, filePath = null) =>
      set({
        project,
        history: emptyHistory(),
        selection: [],
        revision: get().revision + 1,
        dirty: false,
        filePath,
        lastAction: 'Opened project',
      }),

    markSaved: (filePath) =>
      set((state) => ({ dirty: false, filePath: filePath ?? state.filePath })),

    setProjectMeta: (patch) =>
      commit(
        (project) => ({ ...project, project: { ...project.project, ...patch } }),
        'Edit project details',
        'project-meta',
      ),

    setWindow: (patch) =>
      commit(
        (project) => ({ ...project, window: { ...project.window, ...patch } }),
        'Edit window',
        'window',
      ),

    setTheme: (theme) => commit((project) => ({ ...project, theme }), 'Change theme'),

    // -- selection ------------------------------------------------------------

    select: (ids) => set({ selection: ids }),

    toggleSelect: (id) =>
      set((state) => ({
        selection: state.selection.includes(id)
          ? state.selection.filter((existing) => existing !== id)
          : [...state.selection, id],
      })),

    selectAll: () =>
      set((state) => ({
        selection: [...walk(state.project.widgets)]
          .filter((widget) => widget.type !== 'window' && !widget.behavior.locked)
          .map((widget) => widget.id),
      })),

    clearSelection: () => set({ selection: [] }),

    // -- widgets --------------------------------------------------------------

    addWidget: (spec, parentId, position) => {
      const widget = createWidget(spec, get().project.widgets, {
        x: position.x,
        y: position.y,
      });

      commit(
        (project) =>
          withWidgets(project, insertWidgets(project.widgets, parentId, [widget])),
        `Add ${spec.label}`,
      );
      set({ selection: [widget.id] });
      return widget.id;
    },

    updateWidgetById: (id, updater, options = {}) =>
      commit(
        (project) => withWidgets(project, updateWidget(project.widgets, id, updater)),
        options.label ?? 'Edit widget',
        options.mergeKey,
      ),

    updateSelected: (updater, options = {}) => {
      const ids = new Set(get().selection);
      if (ids.size === 0) return;
      commit(
        (project) => withWidgets(project, updateWidgets(project.widgets, ids, updater)),
        options.label ?? 'Edit widgets',
        options.mergeKey,
      );
    },

    moveSelectedBy: (dx, dy, mergeKey = 'move') => {
      const ids = new Set(movableSelection());
      if (ids.size === 0 || (dx === 0 && dy === 0)) return;

      commit(
        (project) =>
          withWidgets(
            project,
            updateWidgets(project.widgets, ids, (widget) => ({
              ...widget,
              layout: {
                ...widget.layout,
                position: {
                  x: Math.round(widget.layout.position.x + dx),
                  y: Math.round(widget.layout.position.y + dy),
                },
              },
            })),
          ),
        'Move',
        mergeKey,
      );
    },

    deleteSelected: () => {
      const ids = new Set(
        get().selection.filter((id) => {
          const widget = findWidget(get().project.widgets, id);
          return widget !== null && widget.type !== 'window' && !widget.behavior.locked;
        }),
      );
      if (ids.size === 0) return;

      commit(
        (project) => withWidgets(project, removeWidgets(project.widgets, ids)),
        ids.size === 1 ? 'Delete widget' : `Delete ${ids.size} widgets`,
      );
      set({ selection: [] });
    },

    duplicateSelected: () => {
      const { project } = get();
      const ids = movableSelection();
      if (ids.length === 0) return;

      const created: string[] = [];
      commit((current) => {
        let widgets = current.widgets;
        for (const id of ids) {
          const source = findWidget(widgets, id);
          if (!source) continue;
          const copy = cloneWidget(source, widgets);
          copy.layout.position = {
            x: copy.layout.position.x + 16,
            y: copy.layout.position.y + 16,
          };
          const parent = findParent(widgets, id);
          widgets = insertWidgets(widgets, parent?.id ?? null, [copy]);
          created.push(copy.id);
        }
        return withWidgets(current, widgets);
      }, ids.length === 1 ? 'Duplicate widget' : `Duplicate ${ids.length} widgets`);

      if (created.length > 0) set({ selection: created });
      void project;
    },

    paste: (widgets, parentId, offset = { x: 16, y: 16 }) => {
      if (widgets.length === 0) return;
      const created: string[] = [];

      commit((project) => {
        let next = project.widgets;
        for (const source of widgets) {
          const copy = cloneWidget(source, next, '');
          copy.layout.position = {
            x: copy.layout.position.x + offset.x,
            y: copy.layout.position.y + offset.y,
          };
          next = insertWidgets(next, parentId, [copy]);
          created.push(copy.id);
        }
        return withWidgets(project, next);
      }, widgets.length === 1 ? 'Paste widget' : `Paste ${widgets.length} widgets`);

      set({ selection: created });
    },

    reparent: (ids, parentId, index) => {
      const { project } = get();
      // Moving a container into its own descendant would detach the subtree.
      const safe = ids.filter(
        (id) => parentId === null || (id !== parentId && !isAncestor(project.widgets, id, parentId)),
      );
      if (safe.length === 0) return;

      commit((current) => {
        const moved = safe
          .map((id) => findWidget(current.widgets, id))
          .filter((widget): widget is Widget => widget !== null);
        if (moved.length === 0) return current;

        // Positions are parent-relative, so rebase them onto the new parent.
        const rects = collectRects(current.widgets);
        const parentRect = parentId ? rects.get(parentId) : undefined;
        const rebased = moved.map((widget) => {
          const rect = rects.get(widget.id);
          if (!rect) return widget;
          return {
            ...widget,
            layout: {
              ...widget.layout,
              position: {
                x: Math.round(rect.x - (parentRect?.x ?? 0)),
                y: Math.round(rect.y - (parentRect?.y ?? 0)),
              },
            },
          };
        });

        const without = removeWidgets(current.widgets, new Set(safe));
        return withWidgets(current, insertWidgets(without, parentId, rebased, index));
      }, 'Move into container');
    },

    reorder: (id, direction) =>
      commit(
        (project) => withWidgets(project, reorderChild(project.widgets, id, direction)),
        `Bring ${direction}`,
      ),

    group: () => {
      const { project } = get();
      const ids = movableSelection();
      if (ids.length < 2) return;

      const rects = collectRects(project.widgets);
      const members = ids
        .map((id) => rects.get(id))
        .filter((rect): rect is NonNullable<typeof rect> => rect !== undefined);
      if (members.length < 2) return;

      const x = Math.min(...members.map((r) => r.x));
      const y = Math.min(...members.map((r) => r.y));
      const width = Math.max(...members.map((r) => r.x + r.width)) - x;
      const height = Math.max(...members.map((r) => r.y + r.height)) - y;

      const parent = findParent(project.widgets, ids[0]);
      let groupId = '';

      commit((current) => {
        const children = ids
          .map((id) => findWidget(current.widgets, id))
          .filter((widget): widget is Widget => widget !== null)
          .map((widget) => {
            const rect = rects.get(widget.id)!;
            return {
              ...widget,
              layout: {
                ...widget.layout,
                position: { x: Math.round(rect.x - x), y: Math.round(rect.y - y) },
              },
            };
          });

        const container = createWidget(
          {
            type: 'group',
            label: 'Group',
            defaultSize: [width, height],
            defaultText: 'Group',
            props: [],
          } as unknown as WidgetSpec,
          current.widgets,
          { x, y, width, height, text: '' },
        );
        groupId = container.id;
        container.children = children;

        const without = removeWidgets(current.widgets, new Set(ids));
        return withWidgets(
          current,
          insertWidgets(without, parent?.id ?? null, [container]),
        );
      }, 'Group widgets');

      if (groupId) set({ selection: [groupId] });
    },

    ungroup: () => {
      const { project, selection } = get();
      const groups = selection
        .map((id) => findWidget(project.widgets, id))
        .filter((widget): widget is Widget => widget !== null && widget.children.length > 0);
      if (groups.length === 0) return;

      const promoted: string[] = [];

      commit((current) => {
        let widgets = current.widgets;
        for (const group of groups) {
          const parent = findParent(widgets, group.id);
          const offset = group.layout.position;
          const children = group.children.map((child) => ({
            ...child,
            layout: {
              ...child.layout,
              position: {
                x: Math.round(child.layout.position.x + offset.x),
                y: Math.round(child.layout.position.y + offset.y),
              },
            },
          }));
          promoted.push(...children.map((child) => child.id));
          widgets = removeWidgets(widgets, new Set([group.id]));
          widgets = insertWidgets(widgets, parent?.id ?? null, children);
        }
        return withWidgets(current, widgets);
      }, 'Ungroup');

      set({ selection: promoted });
    },

    setLocked: (ids, locked) =>
      commit(
        (project) =>
          withWidgets(
            project,
            updateWidgets(project.widgets, new Set(ids), (widget) => ({
              ...widget,
              behavior: { ...widget.behavior, locked },
            })),
          ),
        locked ? 'Lock widget' : 'Unlock widget',
      ),

    setVisible: (ids, visible) =>
      commit(
        (project) =>
          withWidgets(
            project,
            updateWidgets(project.widgets, new Set(ids), (widget) => ({
              ...widget,
              behavior: { ...widget.behavior, visible },
            })),
          ),
        visible ? 'Show widget' : 'Hide widget',
      ),

    align: (mode) => {
      const ids = movableSelection();
      if (ids.length < 2) return;
      const deltas = alignDeltas(rectsFor(get().project.widgets, ids), mode);
      applyDeltas(commit, deltas, `Align ${mode}`);
    },

    distribute: (axis) => {
      const ids = movableSelection();
      if (ids.length < 3) return;
      const deltas = distributeDeltas(rectsFor(get().project.widgets, ids), axis);
      applyDeltas(commit, deltas, `Distribute ${axis}`);
    },

    // -- history --------------------------------------------------------------

    undo: () => {
      const state = get();
      const result = undo(state.history, state.project);
      if (!result) return;
      set({
        project: result.project,
        history: result.history,
        revision: state.revision + 1,
        dirty: true,
        selection: pruneSelection(state.selection, result.project),
        lastAction: `Undo: ${result.label}`,
      });
    },

    redo: () => {
      const state = get();
      const result = redo(state.history, state.project);
      if (!result) return;
      set({
        project: result.project,
        history: result.history,
        revision: state.revision + 1,
        dirty: true,
        selection: pruneSelection(state.selection, result.project),
        lastAction: `Redo: ${result.label}`,
      });
    },

    canUndo: () => get().history.past.length > 0,
    canRedo: () => get().history.future.length > 0,
  };
});

/** Absolute rects for a subset of widget ids, skipping any that no longer exist. */
function rectsFor(widgets: Widget[], ids: string[]): Map<string, Rect> {
  const all = collectRects(widgets);
  const subset = new Map<string, Rect>();
  for (const id of ids) {
    const rect = all.get(id);
    if (rect) subset.set(id, rect);
  }
  return subset;
}

function applyDeltas(
  commit: (mutate: (project: Project) => Project, label: string, mergeKey?: string) => void,
  deltas: Map<string, Point>,
  label: string,
): void {
  if (deltas.size === 0) return;
  commit((project) => {
    let widgets = project.widgets;
    for (const [id, delta] of deltas) {
      if (delta.x === 0 && delta.y === 0) continue;
      widgets = updateWidget(widgets, id, (widget) => ({
        ...widget,
        layout: {
          ...widget.layout,
          position: {
            x: Math.round(widget.layout.position.x + delta.x),
            y: Math.round(widget.layout.position.y + delta.y),
          },
        },
      }));
    }
    return { ...project, widgets };
  }, label);
}

/** After undo/redo a selected widget may no longer exist. */
function pruneSelection(selection: string[], project: Project): string[] {
  const alive = new Set([...walk(project.widgets)].map((widget) => widget.id));
  return selection.filter((id) => alive.has(id));
}

// --- selectors ------------------------------------------------------------------
//
// Zustand compares selector results with `Object.is`, so a selector that builds
// a new array or object every call re-renders forever. These are therefore
// exposed as hooks that subscribe to *stable* references (the widget tree and
// the selection array, both of which only change identity on a real edit) and
// derive the result in `useMemo`.

export function useSelectedWidgets(): Widget[] {
  const selection = useProjectStore((state) => state.selection);
  const widgets = useProjectStore((state) => state.project.widgets);

  return useMemo(
    () =>
      selection
        .map((id) => findWidget(widgets, id))
        .filter((widget): widget is Widget => widget !== null),
    [selection, widgets],
  );
}

/** The most recently selected widget — what the inspector treats as primary. */
export function usePrimaryWidget(): Widget | null {
  const selection = useProjectStore((state) => state.selection);
  const widgets = useProjectStore((state) => state.project.widgets);

  return useMemo(() => {
    const last = selection[selection.length - 1];
    return last ? findWidget(widgets, last) : null;
  }, [selection, widgets]);
}

/** Ancestor chain of the primary selection, outermost first. */
export function useBreadcrumb(): Widget[] {
  const primary = usePrimaryWidget();
  const widgets = useProjectStore((state) => state.project.widgets);

  return useMemo(
    () => (primary ? [...ancestorsOf(widgets, primary.id), primary] : []),
    [primary, widgets],
  );
}
