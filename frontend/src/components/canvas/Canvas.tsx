/**
 * The design canvas.
 *
 * Owns viewport transform (zoom/pan) and every direct-manipulation gesture:
 * click and marquee selection, dragging, resizing, snapping with alignment
 * guides, and dropping new widgets from the library.
 *
 * Gestures are implemented with raw pointer events rather than a drag-and-drop
 * library because they need continuous, pixel-accurate feedback — snapping,
 * live guides, modifier keys mid-drag — that a discrete drop-target abstraction
 * does not express well. Pointer capture keeps a gesture alive even when the
 * cursor leaves the element.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import clsx from 'clsx';
import type { Widget } from '@/types/project';
import {
  boundingBox,
  collectRects,
  computeSnap,
  resizeRect,
  widgetsInRect,
  type Guide,
  type Rect,
  type ResizeHandle,
} from '@/lib/geometry';
import { findWidget, topLevelOf, updateWidgets, walk } from '@/lib/tree';
import { canAcceptChild } from '@/lib/widgetFactory';
import { getSpec, useCatalogStore } from '@/store/catalogStore';
import { useProjectStore } from '@/store/projectStore';
import { useUiStore } from '@/store/uiStore';
import { CanvasWidget } from './CanvasWidget';
import { SelectionOverlay } from './SelectionOverlay';
import { RULER_SIZE, Rulers } from './Rulers';
import { LIBRARY_DRAG_TYPE } from '@/components/library/dragTypes';

type Gesture =
  | { kind: 'none' }
  | {
      kind: 'move';
      startX: number;
      startY: number;
      origins: Map<string, { x: number; y: number }>;
    }
  | {
      kind: 'resize';
      handle: ResizeHandle;
      startX: number;
      startY: number;
      origins: Map<string, Rect>;
    }
  | { kind: 'marquee'; startX: number; startY: number; additive: boolean }
  | { kind: 'pan'; startX: number; startY: number; panX: number; panY: number };

export function Canvas() {
  const viewportRef = useRef<HTMLDivElement>(null);
  const gestureRef = useRef<Gesture>({ kind: 'none' });
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [marquee, setMarquee] = useState<Rect | null>(null);
  const [guides, setGuides] = useState<Guide[]>([]);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [spacePressed, setSpacePressed] = useState(false);

  const project = useProjectStore((state) => state.project);
  const selection = useProjectStore((state) => state.selection);
  const select = useProjectStore((state) => state.select);
  const toggleSelect = useProjectStore((state) => state.toggleSelect);
  const addWidget = useProjectStore((state) => state.addWidget);

  const zoom = useUiStore((state) => state.zoom);
  const pan = useUiStore((state) => state.pan);
  const setPan = useUiStore((state) => state.setPan);
  const setZoom = useUiStore((state) => state.setZoom);
  const showGrid = useUiStore((state) => state.showGrid);
  const gridSize = useUiStore((state) => state.gridSize);
  const snapToGrid = useUiStore((state) => state.snapToGrid);
  const snapToObjects = useUiStore((state) => state.snapToObjects);
  const showRulers = useUiStore((state) => state.showRulers);
  const showOutlines = useUiStore((state) => state.showOutlines);
  const previewMode = useUiStore((state) => state.previewMode);
  const tool = useUiStore((state) => state.tool);
  const zoomToFit = useUiStore((state) => state.zoomToFit);
  const specsLoaded = useCatalogStore((state) => state.specs.length > 0);

  const rootWindow = project.widgets.find((widget) => widget.type === 'window') ?? null;
  const canvasSize = {
    width: rootWindow?.layout.size.width ?? project.window.width,
    height: rootWindow?.layout.size.height ?? project.window.height,
  };

  const selectedSet = useMemo(() => new Set(selection), [selection]);
  const allRects = useMemo(() => collectRects(project.widgets), [project.widgets]);

  const selectedRects = useMemo(() => {
    const map = new Map<string, Rect>();
    for (const id of selection) {
      const rect = allRects.get(id);
      if (rect) map.set(id, rect);
    }
    return map;
  }, [selection, allRects]);

  const selectionBounds = useMemo(
    () => boundingBox([...selectedRects.values()]),
    [selectedRects],
  );

  const selectionResizable = useMemo(
    () =>
      selection.length > 0 &&
      selection.every((id) => {
        const widget = findWidget(project.widgets, id);
        if (!widget || widget.behavior.locked) return false;
        return getSpec(widget.type)?.resizable ?? true;
      }),
    [selection, project.widgets],
  );

  // -- viewport measurement ------------------------------------------------

  useLayoutEffect(() => {
    const element = viewportRef.current;
    if (!element) return;

    const observer = new ResizeObserver(([entry]) => {
      setViewportSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Centre the design the first time the canvas has a size.
  const didInitialFit = useRef(false);
  useEffect(() => {
    if (didInitialFit.current || viewportSize.width === 0 || !specsLoaded) return;
    didInitialFit.current = true;
    zoomToFit(canvasSize, viewportSize);
  }, [viewportSize, canvasSize, zoomToFit, specsLoaded]);

  // -- coordinate conversion -----------------------------------------------

  const toDesign = useCallback(
    (clientX: number, clientY: number) => {
      const rect = viewportRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      return {
        x: (clientX - rect.left - pan.x) / zoom,
        y: (clientY - rect.top - pan.y) / zoom,
      };
    },
    [pan, zoom],
  );

  // -- space-to-pan ---------------------------------------------------------

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.code === 'Space' && !isTypingTarget(event.target)) {
        event.preventDefault();
        setSpacePressed(true);
      }
    };
    const up = (event: KeyboardEvent) => {
      if (event.code === 'Space') setSpacePressed(false);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  // -- wheel: zoom at cursor, or pan ---------------------------------------

  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;

    const onWheel = (event: WheelEvent) => {
      // Ctrl/Cmd + wheel is the near-universal zoom gesture, and trackpad
      // pinch arrives as ctrlKey too.
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        const rect = element.getBoundingClientRect();
        const pointerX = event.clientX - rect.left;
        const pointerY = event.clientY - rect.top;

        const current = useUiStore.getState().zoom;
        const next = Math.min(5, Math.max(0.1, current * (event.deltaY < 0 ? 1.1 : 1 / 1.1)));
        if (next === current) return;

        // Keep the design point under the cursor fixed while scaling.
        const currentPan = useUiStore.getState().pan;
        const scale = next / current;
        setPan({
          x: pointerX - (pointerX - currentPan.x) * scale,
          y: pointerY - (pointerY - currentPan.y) * scale,
        });
        setZoom(next);
        return;
      }

      event.preventDefault();
      const currentPan = useUiStore.getState().pan;
      setPan({
        x: currentPan.x - (event.shiftKey ? event.deltaY : event.deltaX),
        y: currentPan.y - (event.shiftKey ? 0 : event.deltaY),
      });
    };

    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, [setPan, setZoom]);

  // -- gestures -------------------------------------------------------------

  const beginPan = (event: ReactPointerEvent) => {
    gestureRef.current = {
      kind: 'pan',
      startX: event.clientX,
      startY: event.clientY,
      panX: pan.x,
      panY: pan.y,
    };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };

  const handleWidgetPointerDown = (event: ReactPointerEvent, widget: Widget) => {
    if (previewMode) return;
    if (event.button === 1 || spacePressed || tool === 'pan') return; // let the viewport pan

    event.stopPropagation();

    // Clicking a widget inside a container selects the container's *child*, not
    // the deepest descendant — matching how Figma and Qt Designer behave. Alt
    // drills through to the innermost node under the cursor.
    const target = event.altKey ? widget : outermostSelectableAncestor(project.widgets, widget);
    if (target.behavior.locked) return;

    const additive = event.shiftKey || event.metaKey || event.ctrlKey;
    let workingSelection = selection;

    if (additive) {
      toggleSelect(target.id);
      workingSelection = selection.includes(target.id)
        ? selection.filter((id) => id !== target.id)
        : [...selection, target.id];
    } else if (!selection.includes(target.id)) {
      select([target.id]);
      workingSelection = [target.id];
    }

    const movable = topLevelOf(project.widgets, workingSelection).filter((id) => {
      const found = findWidget(project.widgets, id);
      return found !== null && !found.behavior.locked && found.type !== 'window';
    });
    if (movable.length === 0) return;

    const origins = new Map<string, { x: number; y: number }>();
    for (const id of movable) {
      const found = findWidget(project.widgets, id);
      if (found) origins.set(id, { ...found.layout.position });
    }

    const start = toDesign(event.clientX, event.clientY);
    gestureRef.current = { kind: 'move', startX: start.x, startY: start.y, origins };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };

  const handleResizeStart = (event: ReactPointerEvent, handle: ResizeHandle) => {
    event.stopPropagation();
    const origins = new Map<string, Rect>();
    for (const id of selection) {
      const widget = findWidget(project.widgets, id);
      if (!widget || widget.behavior.locked) continue;
      origins.set(id, {
        x: widget.layout.position.x,
        y: widget.layout.position.y,
        width: widget.layout.size.width,
        height: widget.layout.size.height,
      });
    }
    if (origins.size === 0) return;

    const start = toDesign(event.clientX, event.clientY);
    gestureRef.current = { kind: 'resize', handle, startX: start.x, startY: start.y, origins };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };

  const handleViewportPointerDown = (event: ReactPointerEvent) => {
    if (previewMode) return;

    if (event.button === 1 || spacePressed || tool === 'pan') {
      event.preventDefault();
      beginPan(event);
      return;
    }
    if (event.button !== 0) return;

    const additive = event.shiftKey || event.metaKey || event.ctrlKey;
    if (!additive) select([]);

    const start = toDesign(event.clientX, event.clientY);
    gestureRef.current = { kind: 'marquee', startX: start.x, startY: start.y, additive };
    setMarquee({ x: start.x, y: start.y, width: 0, height: 0 });
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: ReactPointerEvent) => {
    const gesture = gestureRef.current;
    if (gesture.kind === 'none') return;

    if (gesture.kind === 'pan') {
      setPan({
        x: gesture.panX + (event.clientX - gesture.startX),
        y: gesture.panY + (event.clientY - gesture.startY),
      });
      return;
    }

    const point = toDesign(event.clientX, event.clientY);

    if (gesture.kind === 'marquee') {
      const rect: Rect = {
        x: Math.min(gesture.startX, point.x),
        y: Math.min(gesture.startY, point.y),
        width: Math.abs(point.x - gesture.startX),
        height: Math.abs(point.y - gesture.startY),
      };
      setMarquee(rect);

      const hits = widgetsInRect(project.widgets, rect);
      select(gesture.additive ? [...new Set([...selection, ...hits])] : hits);
      return;
    }

    if (gesture.kind === 'move') {
      let dx = point.x - gesture.startX;
      let dy = point.y - gesture.startY;

      // Shift constrains to the dominant axis.
      if (event.shiftKey) {
        if (Math.abs(dx) > Math.abs(dy)) dy = 0;
        else dx = 0;
      }

      // Snapping is computed for one representative widget and the resulting
      // correction is applied to the whole selection, so a group keeps its
      // internal spacing while still snapping cleanly.
      const anchorId = [...gesture.origins.keys()][0];
      const anchorRect = allRects.get(anchorId);

      if (anchorRect && !event.altKey) {
        const moving: Rect = {
          x: anchorRect.x + dx,
          y: anchorRect.y + dy,
          width: anchorRect.width,
          height: anchorRect.height,
        };

        const targets = snapTargets(project.widgets, allRects, gesture.origins, canvasSize);
        const snapped = computeSnap(moving, targets, {
          grid: gridSize,
          snapToGrid,
          snapToObjects,
        });
        dx += snapped.rect.x - moving.x;
        dy += snapped.rect.y - moving.y;
        setGuides(snapped.guides);
      } else {
        setGuides([]);
      }

      applyPositions(gesture.origins, dx, dy);
      return;
    }

    if (gesture.kind === 'resize') {
      const dx = point.x - gesture.startX;
      const dy = point.y - gesture.startY;
      applyResize(gesture.origins, gesture.handle, dx, dy, {
        preserveAspect: event.shiftKey,
        fromCenter: event.altKey,
        grid: snapToGrid ? gridSize : 1,
      });
    }
  };

  const endGesture = (event: ReactPointerEvent) => {
    if (gestureRef.current.kind === 'none') return;
    gestureRef.current = { kind: 'none' };
    setMarquee(null);
    setGuides([]);
    try {
      (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
    } catch {
      /* the pointer may already have been released */
    }
  };

  const applyPositions = (
    origins: Map<string, { x: number; y: number }>,
    dx: number,
    dy: number,
  ) => {
    useProjectStore.setState((state) => {
      const widgets = updateWidgets(state.project.widgets, new Set(origins.keys()), (widget) => {
        const origin = origins.get(widget.id)!;
        return {
          ...widget,
          layout: {
            ...widget.layout,
            position: { x: Math.round(origin.x + dx), y: Math.round(origin.y + dy) },
          },
        };
      });
      return commitDuringGesture(state, widgets, 'Move', 'gesture-move');
    });
  };

  const applyResize = (
    origins: Map<string, Rect>,
    handle: ResizeHandle,
    dx: number,
    dy: number,
    options: { preserveAspect: boolean; fromCenter: boolean; grid: number },
  ) => {
    useProjectStore.setState((state) => {
      const widgets = updateWidgets(state.project.widgets, new Set(origins.keys()), (widget) => {
        const origin = origins.get(widget.id)!;
        const resized = resizeRect(origin, handle, dx, dy, options);
        const grid = options.grid;
        return {
          ...widget,
          layout: {
            ...widget.layout,
            position: {
              x: Math.round(resized.x / grid) * grid,
              y: Math.round(resized.y / grid) * grid,
            },
            size: {
              width: Math.max(1, Math.round(resized.width / grid) * grid),
              height: Math.max(1, Math.round(resized.height / grid) * grid),
            },
          },
        };
      });
      return commitDuringGesture(state, widgets, 'Resize', 'gesture-resize');
    });
  };

  // -- drop from the widget library ----------------------------------------

  const handleDragOver = (event: ReactDragEvent) => {
    if (!event.dataTransfer.types.includes(LIBRARY_DRAG_TYPE)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';

    const point = toDesign(event.clientX, event.clientY);
    setDropTargetId(findDropContainer(project.widgets, allRects, point)?.id ?? null);
  };

  const handleDrop = (event: ReactDragEvent) => {
    const type = event.dataTransfer.getData(LIBRARY_DRAG_TYPE);
    setDropTargetId(null);
    if (!type) return;
    event.preventDefault();

    const spec = getSpec(type);
    if (!spec) return;

    const point = toDesign(event.clientX, event.clientY);
    const container = findDropContainer(project.widgets, allRects, point, spec.type);
    const containerRect = container ? allRects.get(container.id) : undefined;

    // Drop point becomes the widget's centre, which is what users expect.
    const [defaultWidth, defaultHeight] = spec.defaultSize;
    let x = point.x - (containerRect?.x ?? 0) - defaultWidth / 2;
    let y = point.y - (containerRect?.y ?? 0) - defaultHeight / 2;

    if (snapToGrid) {
      x = Math.round(x / gridSize) * gridSize;
      y = Math.round(y / gridSize) * gridSize;
    }

    addWidget(spec, container?.id ?? rootWindow?.id ?? null, {
      x: Math.round(x),
      y: Math.round(y),
    });
  };

  // -- render ---------------------------------------------------------------

  const rulerOffset = showRulers && !previewMode ? RULER_SIZE : 0;

  return (
    <div className="relative flex-1 overflow-hidden bg-[rgb(var(--canvas-backdrop))]">
      {showRulers && !previewMode && viewportSize.width > 0 && (
        <Rulers
          zoom={zoom}
          pan={pan}
          viewport={viewportSize}
          highlight={selectionBounds}
        />
      )}

      <div
        ref={viewportRef}
        className={clsx(
          'absolute inset-0 no-select touch-none',
          spacePressed || tool === 'pan' ? 'cursor-grab' : 'cursor-default',
          gestureRef.current.kind === 'pan' && 'cursor-grabbing',
        )}
        style={{ left: rulerOffset, top: rulerOffset }}
        onPointerDown={handleViewportPointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endGesture}
        onPointerCancel={endGesture}
        onDragOver={handleDragOver}
        onDragLeave={() => setDropTargetId(null)}
        onDrop={handleDrop}
      >
        <div
          className="absolute origin-top-left"
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
        >
          {/* The window surface */}
          <div
            className={clsx(
              'relative shadow-float',
              showGrid && !previewMode && 'canvas-grid',
            )}
            style={
              {
                width: canvasSize.width,
                height: canvasSize.height,
                background: rootWindow?.appearance.background ?? project.window.background,
                '--grid-size': `${gridSize}px`,
              } as React.CSSProperties
            }
          >
            {(rootWindow ? rootWindow.children : project.widgets).map((widget) => (
              <CanvasWidget
                key={widget.id}
                widget={widget}
                selectedIds={selectedSet}
                hoveredId={hoveredId}
                previewMode={previewMode}
                showOutlines={showOutlines}
                dropTargetId={dropTargetId}
                onPointerDown={handleWidgetPointerDown}
                onPointerEnter={(w) => setHoveredId(w.id)}
                onPointerLeave={() => setHoveredId(null)}
                onDoubleClick={(w) => select([w.id])}
              />
            ))}

            {!previewMode && (
              <>
                {guides.map((guide, index) => (
                  <div
                    key={`${guide.axis}-${guide.position}-${index}`}
                    className="pointer-events-none absolute z-30 bg-danger"
                    style={
                      guide.axis === 'x'
                        ? {
                            left: guide.position,
                            top: guide.start,
                            height: guide.end - guide.start,
                            width: 1 / zoom,
                          }
                        : {
                            top: guide.position,
                            left: guide.start,
                            width: guide.end - guide.start,
                            height: 1 / zoom,
                          }
                    }
                  />
                ))}

                <SelectionOverlay
                  rects={selectedRects}
                  bounds={selectionBounds}
                  zoom={zoom}
                  resizable={selectionResizable}
                  onResizeStart={handleResizeStart}
                />

                {marquee && (
                  <div
                    className="pointer-events-none absolute z-20 border border-accent bg-accent/10"
                    style={{
                      left: marquee.x,
                      top: marquee.y,
                      width: marquee.width,
                      height: marquee.height,
                      borderWidth: 1 / zoom,
                    }}
                  />
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {previewMode && (
        <div className="pointer-events-none absolute bottom-4 left-1/2 z-40 -translate-x-1/2 rounded-full bg-accent px-3 py-1 text-xs font-medium text-white shadow-float">
          Preview mode — press P to exit
        </div>
      )}
    </div>
  );
}

// --- helpers -------------------------------------------------------------------

/**
 * Write directly to the store during a gesture.
 *
 * Gestures fire dozens of updates per second; routing each through the normal
 * `commit` path would push dozens of history entries. Instead the first update
 * of a gesture records history under a merge key and the rest coalesce into it,
 * so the whole drag is one undo step.
 */
function commitDuringGesture(
  state: ReturnType<typeof useProjectStore.getState>,
  widgets: Widget[],
  label: string,
  mergeKey: string,
) {
  if (widgets === state.project.widgets) return {};

  const project = { ...state.project, widgets };
  const now = Date.now();
  const last = state.history.past[state.history.past.length - 1];
  const merging = last?.mergeKey === mergeKey && now - last.at < 1500;

  return {
    project,
    revision: state.revision + 1,
    dirty: true,
    lastAction: label,
    history: merging
      ? {
          past: [...state.history.past.slice(0, -1), { ...last, at: now }],
          future: [],
        }
      : {
          past: [
            ...state.history.past,
            { project: state.project, label, mergeKey, at: now },
          ].slice(-100),
          future: [],
        },
  };
}

/** Rects the dragged widgets can snap against — siblings, plus the window. */
function snapTargets(
  widgets: Widget[],
  rects: Map<string, Rect>,
  moving: Map<string, unknown>,
  canvasSize: { width: number; height: number },
): Rect[] {
  const targets: Rect[] = [
    { x: 0, y: 0, width: canvasSize.width, height: canvasSize.height },
  ];

  for (const widget of walk(widgets)) {
    if (widget.type === 'window' || moving.has(widget.id) || !widget.behavior.visible) continue;
    const rect = rects.get(widget.id);
    if (rect) targets.push(rect);
  }

  return targets;
}

/** Deepest container under `point` that will accept `childType`. */
function findDropContainer(
  widgets: Widget[],
  rects: Map<string, Rect>,
  point: { x: number; y: number },
  childType?: string,
): Widget | null {
  let best: Widget | null = null;
  let bestArea = Number.POSITIVE_INFINITY;

  for (const widget of walk(widgets)) {
    if (widget.type === 'window') continue;
    const spec = getSpec(widget.type);
    if (!spec?.container || widget.behavior.locked) continue;
    if (childType && !canAcceptChild(spec, childType, widget.children.length)) continue;

    const rect = rects.get(widget.id);
    if (!rect) continue;
    const inside =
      point.x >= rect.x &&
      point.y >= rect.y &&
      point.x <= rect.x + rect.width &&
      point.y <= rect.y + rect.height;
    if (!inside) continue;

    const area = rect.width * rect.height;
    if (area < bestArea) {
      best = widget;
      bestArea = area;
    }
  }

  return best;
}

/**
 * Selecting inside a container should grab the container, not its innermost
 * child — until the container is already selected, at which point clicking
 * again drills in. Alt bypasses this entirely.
 */
function outermostSelectableAncestor(widgets: Widget[], widget: Widget): Widget {
  const selection = useProjectStore.getState().selection;
  const chain: Widget[] = [];

  const search = (nodes: Widget[], trail: Widget[]): boolean => {
    for (const node of nodes) {
      const nextTrail = [...trail, node];
      if (node.id === widget.id) {
        chain.push(...nextTrail);
        return true;
      }
      if (search(node.children, nextTrail)) return true;
    }
    return false;
  };
  search(widgets, []);

  // Skip the root window, then take the first node whose parent is selected —
  // otherwise the outermost node in the chain.
  const candidates = chain.filter((node) => node.type !== 'window');
  if (candidates.length === 0) return widget;

  for (let index = 0; index < candidates.length; index += 1) {
    const parent = candidates[index - 1];
    if (parent && selection.includes(parent.id)) return candidates[index];
  }
  return candidates[0];
}

function isTypingTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element) return false;
  const tag = element.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || element.isContentEditable;
}
