/**
 * Canvas geometry: snapping, alignment guides and hit testing.
 *
 * All of this operates in *design space* (the coordinate system of the window
 * being designed). Zoom and pan are applied by the canvas as a CSS transform,
 * so nothing here has to think about screen pixels.
 */

import type { Point, Size, Widget } from '@/types/project';
import { absolutePosition, walk } from './tree';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const rectOf = (widget: Widget, origin: Point = { x: 0, y: 0 }): Rect => ({
  x: origin.x + widget.layout.position.x,
  y: origin.y + widget.layout.position.y,
  width: widget.layout.size.width,
  height: widget.layout.size.height,
});

export const right = (rect: Rect) => rect.x + rect.width;
export const bottom = (rect: Rect) => rect.y + rect.height;
export const centerX = (rect: Rect) => rect.x + rect.width / 2;
export const centerY = (rect: Rect) => rect.y + rect.height / 2;

export function intersects(a: Rect, b: Rect): boolean {
  return !(right(a) < b.x || a.x > right(b) || bottom(a) < b.y || a.y > bottom(b));
}

export function contains(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    right(inner) <= right(outer) &&
    bottom(inner) <= bottom(outer)
  );
}

export function boundingBox(rects: Rect[]): Rect | null {
  if (rects.length === 0) return null;
  const x = Math.min(...rects.map((r) => r.x));
  const y = Math.min(...rects.map((r) => r.y));
  return {
    x,
    y,
    width: Math.max(...rects.map(right)) - x,
    height: Math.max(...rects.map(bottom)) - y,
  };
}

export const snapValue = (value: number, grid: number): number =>
  grid <= 1 ? Math.round(value) : Math.round(value / grid) * grid;

// --- alignment guides ----------------------------------------------------------

export interface Guide {
  axis: 'x' | 'y';
  /** Design-space coordinate of the guide line. */
  position: number;
  /** Extent of the highlight, so the guide only spans the relevant widgets. */
  start: number;
  end: number;
}

/** How close (in design px) an edge must be before it snaps. */
export const SNAP_THRESHOLD = 6;

interface SnapCandidate {
  /** Offset to apply to the moving rect. */
  delta: number;
  guide: Guide;
}

/**
 * Snap `moving` against `targets`, returning the adjusted rect plus the guides
 * that should be drawn. Edges and centres are considered on both axes, and the
 * closest candidate within the threshold wins per axis.
 */
export function computeSnap(
  moving: Rect,
  targets: Rect[],
  options: { grid: number; snapToGrid: boolean; snapToObjects: boolean },
): { rect: Rect; guides: Guide[] } {
  const guides: Guide[] = [];
  let { x, y } = moving;

  if (options.snapToObjects && targets.length > 0) {
    const horizontal = bestCandidate(
      [
        ...edgeCandidates(moving.x, targets, ['x', 'right', 'centerX'], moving, 'x'),
        ...edgeCandidates(right(moving), targets, ['x', 'right', 'centerX'], moving, 'x'),
        ...edgeCandidates(centerX(moving), targets, ['x', 'right', 'centerX'], moving, 'x'),
      ],
      moving,
      'x',
    );
    if (horizontal) {
      x += horizontal.delta;
      guides.push(horizontal.guide);
    }

    const vertical = bestCandidate(
      [
        ...edgeCandidates(moving.y, targets, ['y', 'bottom', 'centerY'], moving, 'y'),
        ...edgeCandidates(bottom(moving), targets, ['y', 'bottom', 'centerY'], moving, 'y'),
        ...edgeCandidates(centerY(moving), targets, ['y', 'bottom', 'centerY'], moving, 'y'),
      ],
      moving,
      'y',
    );
    if (vertical) {
      y += vertical.delta;
      guides.push(vertical.guide);
    }
  }

  if (options.snapToGrid && guides.length === 0) {
    x = snapValue(x, options.grid);
    y = snapValue(y, options.grid);
  } else if (options.snapToGrid) {
    if (!guides.some((g) => g.axis === 'x')) x = snapValue(x, options.grid);
    if (!guides.some((g) => g.axis === 'y')) y = snapValue(y, options.grid);
  }

  return { rect: { ...moving, x, y }, guides };
}

type EdgeKey = 'x' | 'right' | 'centerX' | 'y' | 'bottom' | 'centerY';

const edgeValue = (rect: Rect, key: EdgeKey): number => {
  switch (key) {
    case 'x':
      return rect.x;
    case 'right':
      return right(rect);
    case 'centerX':
      return centerX(rect);
    case 'y':
      return rect.y;
    case 'bottom':
      return bottom(rect);
    case 'centerY':
      return centerY(rect);
  }
};

function edgeCandidates(
  movingEdge: number,
  targets: Rect[],
  keys: EdgeKey[],
  moving: Rect,
  axis: 'x' | 'y',
): SnapCandidate[] {
  const candidates: SnapCandidate[] = [];

  for (const target of targets) {
    for (const key of keys) {
      const value = edgeValue(target, key);
      const distance = value - movingEdge;
      if (Math.abs(distance) > SNAP_THRESHOLD) continue;

      candidates.push({
        delta: distance,
        guide:
          axis === 'x'
            ? {
                axis: 'x',
                position: value,
                start: Math.min(moving.y, target.y),
                end: Math.max(bottom(moving), bottom(target)),
              }
            : {
                axis: 'y',
                position: value,
                start: Math.min(moving.x, target.x),
                end: Math.max(right(moving), right(target)),
              },
      });
    }
  }

  return candidates;
}

function bestCandidate(
  candidates: SnapCandidate[],
  _moving: Rect,
  _axis: 'x' | 'y',
): SnapCandidate | null {
  if (candidates.length === 0) return null;
  return candidates.reduce((best, candidate) =>
    Math.abs(candidate.delta) < Math.abs(best.delta) ? candidate : best,
  );
}

// --- resize --------------------------------------------------------------------

export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

export const RESIZE_HANDLES: ResizeHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

export const MIN_SIZE = 8;

/** Apply a pointer delta to one rect for the given handle. */
export function resizeRect(
  rect: Rect,
  handle: ResizeHandle,
  deltaX: number,
  deltaY: number,
  options: { preserveAspect?: boolean; fromCenter?: boolean } = {},
): Rect {
  let { x, y, width, height } = rect;

  if (handle.includes('w')) {
    const applied = Math.min(deltaX, width - MIN_SIZE);
    x += applied;
    width -= applied;
  }
  if (handle.includes('e')) {
    width = Math.max(MIN_SIZE, width + deltaX);
  }
  if (handle.includes('n')) {
    const applied = Math.min(deltaY, height - MIN_SIZE);
    y += applied;
    height -= applied;
  }
  if (handle.includes('s')) {
    height = Math.max(MIN_SIZE, height + deltaY);
  }

  if (options.preserveAspect && rect.width > 0 && rect.height > 0) {
    const ratio = rect.width / rect.height;
    if (handle === 'e' || handle === 'w') {
      height = Math.max(MIN_SIZE, width / ratio);
    } else if (handle === 'n' || handle === 's') {
      width = Math.max(MIN_SIZE, height * ratio);
    } else {
      height = Math.max(MIN_SIZE, width / ratio);
      if (handle.includes('n')) y = bottom(rect) - height;
    }
  }

  if (options.fromCenter) {
    const dx = width - rect.width;
    const dy = height - rect.height;
    x = rect.x - dx / 2;
    y = rect.y - dy / 2;
  }

  return { x, y, width: Math.max(MIN_SIZE, width), height: Math.max(MIN_SIZE, height) };
}

export const cursorForHandle: Record<ResizeHandle, string> = {
  nw: 'nwse-resize',
  n: 'ns-resize',
  ne: 'nesw-resize',
  e: 'ew-resize',
  se: 'nwse-resize',
  s: 'ns-resize',
  sw: 'nesw-resize',
  w: 'ew-resize',
};

// --- hit testing ---------------------------------------------------------------

/** Absolute rects for every widget in the tree, keyed by id. */
export function collectRects(widgets: Widget[]): Map<string, Rect> {
  const rects = new Map<string, Rect>();
  for (const widget of walk(widgets)) {
    const position = absolutePosition(widgets, widget.id);
    rects.set(widget.id, {
      x: position.x,
      y: position.y,
      width: widget.layout.size.width,
      height: widget.layout.size.height,
    });
  }
  return rects;
}

/** Ids whose rect intersects `marquee`, for rubber-band selection. */
export function widgetsInRect(
  widgets: Widget[],
  marquee: Rect,
  options: { requireFullContainment?: boolean } = {},
): string[] {
  const rects = collectRects(widgets);
  const hits: string[] = [];

  for (const widget of walk(widgets)) {
    if (widget.type === 'window' || widget.behavior.locked || !widget.behavior.visible) continue;
    const rect = rects.get(widget.id);
    if (!rect) continue;
    const hit = options.requireFullContainment
      ? contains(marquee, rect)
      : intersects(marquee, rect);
    if (hit) hits.push(widget.id);
  }

  return hits;
}

// --- alignment & distribution --------------------------------------------------

export type AlignMode = 'left' | 'centerX' | 'right' | 'top' | 'centerY' | 'bottom';

/** Position deltas that align `rects` to their shared bounding box. */
export function alignDeltas(rects: Map<string, Rect>, mode: AlignMode): Map<string, Point> {
  const values = [...rects.values()];
  const box = boundingBox(values);
  const deltas = new Map<string, Point>();
  if (!box) return deltas;

  for (const [id, rect] of rects) {
    switch (mode) {
      case 'left':
        deltas.set(id, { x: box.x - rect.x, y: 0 });
        break;
      case 'right':
        deltas.set(id, { x: right(box) - right(rect), y: 0 });
        break;
      case 'centerX':
        deltas.set(id, { x: centerX(box) - centerX(rect), y: 0 });
        break;
      case 'top':
        deltas.set(id, { x: 0, y: box.y - rect.y });
        break;
      case 'bottom':
        deltas.set(id, { x: 0, y: bottom(box) - bottom(rect) });
        break;
      case 'centerY':
        deltas.set(id, { x: 0, y: centerY(box) - centerY(rect) });
        break;
    }
  }

  return deltas;
}

/** Even spacing across the bounding box; needs at least three widgets. */
export function distributeDeltas(
  rects: Map<string, Rect>,
  axis: 'horizontal' | 'vertical',
): Map<string, Point> {
  const deltas = new Map<string, Point>();
  const entries = [...rects.entries()];
  if (entries.length < 3) return deltas;

  const horizontal = axis === 'horizontal';
  entries.sort(([, a], [, b]) => (horizontal ? a.x - b.x : a.y - b.y));

  const first = entries[0][1];
  const last = entries[entries.length - 1][1];
  const span = horizontal ? last.x - first.x : last.y - first.y;
  const step = span / (entries.length - 1);

  entries.forEach(([id, rect], index) => {
    if (index === 0 || index === entries.length - 1) return;
    const target = (horizontal ? first.x : first.y) + step * index;
    deltas.set(id, {
      x: horizontal ? target - rect.x : 0,
      y: horizontal ? 0 : target - rect.y,
    });
  });

  return deltas;
}

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export const roundSize = (size: Size): Size => ({
  width: Math.round(size.width),
  height: Math.round(size.height),
});
