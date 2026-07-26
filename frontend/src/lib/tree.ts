/**
 * Immutable widget-tree operations.
 *
 * The store keeps the project immutable so undo/redo is a matter of swapping
 * snapshots. Every function here returns new nodes along the changed path and
 * reuses untouched subtrees, which keeps React re-renders proportional to the
 * edit rather than to the size of the design.
 */

import type { Widget } from '@/types/project';

export type WidgetPredicate = (widget: Widget) => boolean;

/** Depth-first walk over a forest. */
export function* walk(widgets: Widget[]): Generator<Widget> {
  for (const widget of widgets) {
    yield widget;
    yield* walk(widget.children);
  }
}

export function findWidget(widgets: Widget[], id: string): Widget | null {
  for (const widget of walk(widgets)) {
    if (widget.id === id) return widget;
  }
  return null;
}

export function findParent(widgets: Widget[], id: string): Widget | null {
  for (const widget of walk(widgets)) {
    if (widget.children.some((child) => child.id === id)) return widget;
  }
  return null;
}

/** Ancestors of `id`, outermost first. Used by the canvas to draw context. */
export function ancestorsOf(widgets: Widget[], id: string): Widget[] {
  const chain: Widget[] = [];

  const search = (nodes: Widget[], trail: Widget[]): boolean => {
    for (const node of nodes) {
      if (node.id === id) {
        chain.push(...trail);
        return true;
      }
      if (search(node.children, [...trail, node])) return true;
    }
    return false;
  };

  search(widgets, []);
  return chain;
}

/** Absolute canvas position, accumulated through every ancestor. */
export function absolutePosition(widgets: Widget[], id: string): { x: number; y: number } {
  const widget = findWidget(widgets, id);
  if (!widget) return { x: 0, y: 0 };

  return ancestorsOf(widgets, id).reduce(
    (accumulator, ancestor) =>
      ancestor.type === 'window'
        ? accumulator
        : {
            x: accumulator.x + ancestor.layout.position.x,
            y: accumulator.y + ancestor.layout.position.y,
          },
    { x: widget.layout.position.x, y: widget.layout.position.y },
  );
}

/** Replace one widget, rebuilding only the path to it. */
export function updateWidget(
  widgets: Widget[],
  id: string,
  updater: (widget: Widget) => Widget,
): Widget[] {
  let changed = false;

  const visit = (nodes: Widget[]): Widget[] => {
    const next = nodes.map((node) => {
      if (node.id === id) {
        changed = true;
        return updater(node);
      }
      if (node.children.length === 0) return node;
      const children = visit(node.children);
      return children === node.children ? node : { ...node, children };
    });
    return changed ? next : nodes;
  };

  return visit(widgets);
}

/** Apply the same update to many widgets in a single pass. */
export function updateWidgets(
  widgets: Widget[],
  ids: Set<string>,
  updater: (widget: Widget) => Widget,
): Widget[] {
  if (ids.size === 0) return widgets;

  const visit = (nodes: Widget[]): Widget[] =>
    nodes.map((node) => {
      const updated = ids.has(node.id) ? updater(node) : node;
      if (updated.children.length === 0) return updated;
      const children = visit(updated.children);
      return children === updated.children ? updated : { ...updated, children };
    });

  return visit(widgets);
}

export function removeWidgets(widgets: Widget[], ids: Set<string>): Widget[] {
  const visit = (nodes: Widget[]): Widget[] =>
    nodes
      .filter((node) => !ids.has(node.id))
      .map((node) =>
        node.children.length === 0 ? node : { ...node, children: visit(node.children) },
      );

  return visit(widgets);
}

/**
 * Insert `newWidgets` into `parentId` at `index`.
 * A null parent appends to the forest root.
 */
export function insertWidgets(
  widgets: Widget[],
  parentId: string | null,
  newWidgets: Widget[],
  index?: number,
): Widget[] {
  if (parentId === null) {
    const target = index ?? widgets.length;
    return [...widgets.slice(0, target), ...newWidgets, ...widgets.slice(target)];
  }

  return updateWidget(widgets, parentId, (parent) => {
    const target = index ?? parent.children.length;
    return {
      ...parent,
      children: [
        ...parent.children.slice(0, target),
        ...newWidgets,
        ...parent.children.slice(target),
      ],
    };
  });
}

/** Reorder within the parent's child list — this is the z-order model. */
export function reorderChild(
  widgets: Widget[],
  id: string,
  direction: 'front' | 'back' | 'forward' | 'backward',
): Widget[] {
  const parent = findParent(widgets, id);
  const siblings = parent ? parent.children : widgets;
  const from = siblings.findIndex((child) => child.id === id);
  if (from === -1) return widgets;

  const to = {
    front: siblings.length - 1,
    back: 0,
    forward: Math.min(siblings.length - 1, from + 1),
    backward: Math.max(0, from - 1),
  }[direction];

  if (to === from) return widgets;

  const next = [...siblings];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);

  return parent
    ? updateWidget(widgets, parent.id, (node) => ({ ...node, children: next }))
    : next;
}

/** True when `ancestorId` contains `descendantId` — guards illegal reparenting. */
export function isAncestor(widgets: Widget[], ancestorId: string, descendantId: string): boolean {
  const ancestor = findWidget(widgets, ancestorId);
  if (!ancestor) return false;
  for (const node of walk(ancestor.children)) {
    if (node.id === descendantId) return true;
  }
  return false;
}

/** Drop ids whose ancestor is also selected, so a drag moves each node once. */
export function topLevelOf(widgets: Widget[], ids: string[]): string[] {
  const set = new Set(ids);
  return ids.filter((id) => !ancestorsOf(widgets, id).some((a) => set.has(a.id)));
}

export function countWidgets(widgets: Widget[]): number {
  let total = 0;
  for (const _ of walk(widgets)) total += 1;
  return total;
}
