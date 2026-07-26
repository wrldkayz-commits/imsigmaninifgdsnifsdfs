/**
 * The layer tree.
 *
 * Mirrors the widget hierarchy and doubles as the z-order control: within a
 * parent, later children draw on top, and the list is shown top-most first to
 * match that mental model.
 *
 * Dragging a row reparents or reorders. The drop indicator distinguishes
 * "into" (hovering the middle of a container) from "before/after" (hovering an
 * edge), which is the interaction people already know from file managers.
 */

import { useMemo, useState, type DragEvent } from 'react';
import clsx from 'clsx';
import { ChevronRight, Eye, EyeOff, Lock, LockOpen } from 'lucide-react';
import type { Widget } from '@/types/project';
import { getSpec } from '@/store/catalogStore';
import { useProjectStore } from '@/store/projectStore';
import { findParent } from '@/lib/tree';
import { WidgetIcon } from '@/components/ui/WidgetIcon';
import { EmptyState } from '@/components/ui/primitives';

type DropPosition = 'before' | 'after' | 'inside';

const LAYER_DRAG_TYPE = 'application/x-guiforge-layer';

export function LayerTree() {
  const project = useProjectStore((state) => state.project);
  const selection = useProjectStore((state) => state.selection);
  const select = useProjectStore((state) => state.select);
  const toggleSelect = useProjectStore((state) => state.toggleSelect);
  const setVisible = useProjectStore((state) => state.setVisible);
  const setLocked = useProjectStore((state) => state.setLocked);
  const reparent = useProjectStore((state) => state.reparent);

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [dragOver, setDragOver] = useState<{ id: string; position: DropPosition } | null>(null);

  const root = project.widgets.find((widget) => widget.type === 'window');
  const roots = root ? root.children : project.widgets;
  const selectedSet = useMemo(() => new Set(selection), [selection]);

  const toggleCollapse = (id: string) =>
    setCollapsed((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const handleDrop = (target: Widget, position: DropPosition) => {
    setDragOver(null);
    const dragged = selection.length > 0 ? selection : [];
    if (dragged.length === 0 || dragged.includes(target.id)) return;

    if (position === 'inside') {
      reparent(dragged, target.id);
      return;
    }

    const parent = findParent(project.widgets, target.id);
    const siblings = parent ? parent.children : roots;
    const index = siblings.findIndex((child) => child.id === target.id);
    reparent(dragged, parent?.id ?? root?.id ?? null, position === 'before' ? index : index + 1);
  };

  if (roots.length === 0) {
    return (
      <EmptyState
        title="No widgets yet"
        hint="Drag something from the widget library onto the canvas to get started."
      />
    );
  }

  const renderRow = (widget: Widget, depth: number) => {
    const spec = getSpec(widget.type);
    const hasChildren = widget.children.length > 0;
    const isCollapsed = collapsed.has(widget.id);
    const isSelected = selectedSet.has(widget.id);
    const indicator = dragOver?.id === widget.id ? dragOver.position : null;

    return (
      <div key={widget.id}>
        <div
          draggable
          onDragStart={(event) => {
            if (!isSelected) select([widget.id]);
            event.dataTransfer.setData(LAYER_DRAG_TYPE, widget.id);
            event.dataTransfer.effectAllowed = 'move';
          }}
          onDragOver={(event) => onRowDragOver(event, widget, spec?.container ?? false, setDragOver)}
          onDragLeave={() => setDragOver((current) => (current?.id === widget.id ? null : current))}
          onDrop={(event) => {
            event.preventDefault();
            if (indicator) handleDrop(widget, indicator);
          }}
          onClick={(event) => {
            if (event.shiftKey || event.metaKey || event.ctrlKey) toggleSelect(widget.id);
            else select([widget.id]);
          }}
          className={clsx(
            'group relative flex h-6 cursor-default items-center gap-1 pr-1 text-xs',
            isSelected ? 'bg-accent-soft text-accent' : 'text-ink hover:bg-surface-sunken',
            indicator === 'inside' && 'ring-1 ring-inset ring-ok',
          )}
          style={{ paddingLeft: 4 + depth * 12 }}
        >
          {indicator === 'before' && <DropLine className="top-0" />}
          {indicator === 'after' && <DropLine className="bottom-0" />}

          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              if (hasChildren) toggleCollapse(widget.id);
            }}
            className={clsx('shrink-0 rounded p-0.5', !hasChildren && 'invisible')}
            aria-label={isCollapsed ? 'Expand' : 'Collapse'}
          >
            <ChevronRight
              size={11}
              className={clsx('transition-transform', !isCollapsed && 'rotate-90')}
            />
          </button>

          <WidgetIcon name={spec?.icon ?? 'square'} size={12} className="shrink-0 opacity-70" />

          <span
            className={clsx(
              'min-w-0 flex-1 truncate',
              !widget.behavior.visible && 'italic opacity-50',
            )}
            title={`${widget.name} (${widget.type})`}
          >
            {widget.name || widget.type}
          </span>

          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setLocked([widget.id], !widget.behavior.locked);
            }}
            className={clsx(
              'shrink-0 rounded p-0.5 hover:text-accent',
              widget.behavior.locked ? 'text-warn' : 'text-ink-muted opacity-0 group-hover:opacity-100',
            )}
            aria-label={widget.behavior.locked ? 'Unlock' : 'Lock'}
          >
            {widget.behavior.locked ? <Lock size={11} /> : <LockOpen size={11} />}
          </button>

          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setVisible([widget.id], !widget.behavior.visible);
            }}
            className={clsx(
              'shrink-0 rounded p-0.5 hover:text-accent',
              widget.behavior.visible
                ? 'text-ink-muted opacity-0 group-hover:opacity-100'
                : 'text-warn',
            )}
            aria-label={widget.behavior.visible ? 'Hide' : 'Show'}
          >
            {widget.behavior.visible ? <Eye size={11} /> : <EyeOff size={11} />}
          </button>
        </div>

        {hasChildren && !isCollapsed && (
          // Reversed: the last child paints on top, so it belongs at the top of
          // the list.
          <div>{[...widget.children].reverse().map((child) => renderRow(child, depth + 1))}</div>
        )}
      </div>
    );
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto py-1">
      {[...roots].reverse().map((widget) => renderRow(widget, 0))}
    </div>
  );
}

function onRowDragOver(
  event: DragEvent<HTMLDivElement>,
  widget: Widget,
  isContainer: boolean,
  setDragOver: (value: { id: string; position: DropPosition } | null) => void,
) {
  if (!event.dataTransfer.types.includes(LAYER_DRAG_TYPE)) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';

  const bounds = event.currentTarget.getBoundingClientRect();
  const ratio = (event.clientY - bounds.top) / bounds.height;

  const position: DropPosition = !isContainer
    ? ratio < 0.5
      ? 'before'
      : 'after'
    : ratio < 0.25
      ? 'before'
      : ratio > 0.75
        ? 'after'
        : 'inside';

  setDragOver({ id: widget.id, position });
}

function DropLine({ className }: { className: string }) {
  return <div className={clsx('pointer-events-none absolute inset-x-0 h-0.5 bg-ok', className)} />;
}
