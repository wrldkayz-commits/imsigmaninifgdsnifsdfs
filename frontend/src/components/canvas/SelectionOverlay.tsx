/**
 * Selection chrome: the bounding box, resize handles and size readout.
 *
 * Drawn in design space above the widget layer so handles are never clipped by
 * a container's overflow. Handle hit areas are scaled by the inverse of zoom so
 * they stay a constant physical size — grabbing an 8px handle at 25% zoom is
 * otherwise impossible.
 */

import type { PointerEvent as ReactPointerEvent } from 'react';
import type { Rect } from '@/lib/geometry';
import { RESIZE_HANDLES, cursorForHandle, type ResizeHandle } from '@/lib/geometry';

interface SelectionOverlayProps {
  /** Absolute design-space rects of every selected widget. */
  rects: Map<string, Rect>;
  /** Combined bounds, which is what carries the resize handles. */
  bounds: Rect | null;
  zoom: number;
  resizable: boolean;
  onResizeStart: (event: ReactPointerEvent, handle: ResizeHandle) => void;
}

export function SelectionOverlay({
  rects,
  bounds,
  zoom,
  resizable,
  onResizeStart,
}: SelectionOverlayProps) {
  if (!bounds) return null;

  const inverse = 1 / zoom;
  const handleSize = 8 * inverse;
  const multiple = rects.size > 1;

  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      {/* Individual outlines, so a multi-selection shows what is in it. */}
      {multiple &&
        [...rects.entries()].map(([id, rect]) => (
          <div
            key={id}
            className="absolute border border-accent/45"
            style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
          />
        ))}

      <div
        className="absolute border border-accent"
        style={{
          left: bounds.x,
          top: bounds.y,
          width: bounds.width,
          height: bounds.height,
          borderWidth: Math.max(1, inverse),
        }}
      >
        <div
          className="absolute whitespace-nowrap rounded bg-accent px-1 font-mono text-white"
          style={{
            bottom: `calc(100% + ${4 * inverse}px)`,
            left: 0,
            fontSize: 10 * inverse,
            padding: `${1 * inverse}px ${4 * inverse}px`,
          }}
        >
          {Math.round(bounds.width)} × {Math.round(bounds.height)}
          {multiple ? `  ·  ${rects.size} selected` : ''}
        </div>

        {resizable &&
          RESIZE_HANDLES.map((handle) => (
            <div
              key={handle}
              role="presentation"
              className="pointer-events-auto absolute rounded-[2px] border border-accent bg-surface"
              style={{
                ...handlePosition(handle, handleSize),
                width: handleSize,
                height: handleSize,
                cursor: cursorForHandle[handle],
                borderWidth: Math.max(1, inverse),
              }}
              onPointerDown={(event) => onResizeStart(event, handle)}
            />
          ))}
      </div>
    </div>
  );
}

function handlePosition(handle: ResizeHandle, size: number) {
  const offset = -size / 2;
  const middle = `calc(50% - ${size / 2}px)`;

  const horizontal = handle.includes('w')
    ? { left: offset }
    : handle.includes('e')
      ? { right: offset }
      : { left: middle };

  const vertical = handle.includes('n')
    ? { top: offset }
    : handle.includes('s')
      ? { bottom: offset }
      : { top: middle };

  return { ...horizontal, ...vertical };
}
