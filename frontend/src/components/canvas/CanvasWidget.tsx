/**
 * One node of the design tree, positioned absolutely inside its parent.
 *
 * Rendering is recursive and memoised: a subtree only re-renders when its own
 * widget object changes identity, which — because the store rebuilds just the
 * path to an edit — means dragging one button does not re-render the other
 * ninety-nine.
 */

import { memo, type PointerEvent as ReactPointerEvent } from 'react';
import clsx from 'clsx';
import type { Widget } from '@/types/project';
import { rendererFor } from '@/components/widgets/renderers';

interface CanvasWidgetProps {
  widget: Widget;
  selectedIds: Set<string>;
  hoveredId: string | null;
  previewMode: boolean;
  showOutlines: boolean;
  /** Container currently highlighted as a drop target. */
  dropTargetId: string | null;
  onPointerDown: (event: ReactPointerEvent, widget: Widget) => void;
  onPointerEnter: (widget: Widget) => void;
  onPointerLeave: (widget: Widget) => void;
  onDoubleClick: (widget: Widget) => void;
}

function CanvasWidgetImpl({
  widget,
  selectedIds,
  hoveredId,
  previewMode,
  showOutlines,
  dropTargetId,
  onPointerDown,
  onPointerEnter,
  onPointerLeave,
  onDoubleClick,
}: CanvasWidgetProps) {
  // Hidden widgets stay visible in the editor at reduced opacity — designers
  // need to select and re-show them, which a `display: none` would prevent.
  if (previewMode && !widget.behavior.visible) return null;

  const selected = selectedIds.has(widget.id);
  const isDropTarget = dropTargetId === widget.id;
  const render = rendererFor(widget.type);

  const children = widget.children.length > 0 && (
    <>
      {widget.children.map((child) => (
        <CanvasWidget
          key={child.id}
          widget={child}
          selectedIds={selectedIds}
          hoveredId={hoveredId}
          previewMode={previewMode}
          showOutlines={showOutlines}
          dropTargetId={dropTargetId}
          onPointerDown={onPointerDown}
          onPointerEnter={onPointerEnter}
          onPointerLeave={onPointerLeave}
          onDoubleClick={onDoubleClick}
        />
      ))}
    </>
  );

  return (
    <div
      data-widget-id={widget.id}
      className={clsx(
        'absolute',
        !previewMode && 'cursor-default',
        widget.behavior.locked && !previewMode && 'cursor-not-allowed',
      )}
      style={{
        left: widget.layout.position.x,
        top: widget.layout.position.y,
        width: widget.layout.size.width,
        height: widget.layout.size.height,
        opacity: widget.behavior.visible
          ? widget.appearance.opacity
          : previewMode
            ? 0
            : widget.appearance.opacity * 0.35,
        // Disabled widgets are dimmed so the designer can see the state without
        // it interfering with selection.
        filter: widget.behavior.enabled ? undefined : 'grayscale(0.6)',
        pointerEvents: previewMode ? 'none' : 'auto',
      }}
      onPointerDown={(event) => onPointerDown(event, widget)}
      onPointerEnter={() => onPointerEnter(widget)}
      onPointerLeave={() => onPointerLeave(widget)}
      onDoubleClick={(event) => {
        event.stopPropagation();
        onDoubleClick(widget);
      }}
    >
      {render({ widget, children, preview: previewMode })}

      {!previewMode && (
        <div
          aria-hidden
          className={clsx(
            'pointer-events-none absolute inset-0',
            selected && 'ring-1 ring-accent',
            !selected && hoveredId === widget.id && 'ring-1 ring-accent/50',
            !selected && showOutlines && 'ring-1 ring-ink-muted/30',
            isDropTarget && 'ring-2 ring-ok bg-ok/10',
          )}
        />
      )}
    </div>
  );
}

export const CanvasWidget = memo(CanvasWidgetImpl);
