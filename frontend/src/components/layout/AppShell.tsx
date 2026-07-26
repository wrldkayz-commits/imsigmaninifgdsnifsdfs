/**
 * The three-pane editor layout.
 *
 * Panels are resizable by dragging their inner edge. Sizes are clamped so a
 * pane can never be dragged to nothing — collapsing is what the toolbar toggles
 * are for, and a 4px-wide panel is a bug, not a feature.
 */

import { useCallback, useRef, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { useUiStore } from '@/store/uiStore';

interface AppShellProps {
  toolbar: ReactNode;
  left: ReactNode;
  center: ReactNode;
  right: ReactNode;
  bottom: ReactNode;
  statusBar: ReactNode;
}

const LEFT_RANGE: [number, number] = [180, 420];
const RIGHT_RANGE: [number, number] = [220, 520];

export function AppShell({ toolbar, left, center, right, bottom, statusBar }: AppShellProps) {
  const leftOpen = useUiStore((state) => state.leftPanelOpen);
  const rightOpen = useUiStore((state) => state.rightPanelOpen);
  const bottomOpen = useUiStore((state) => state.bottomPanelOpen);
  const bottomHeight = useUiStore((state) => state.bottomPanelHeight);
  const setBottomHeight = useUiStore((state) => state.setBottomPanelHeight);
  const previewMode = useUiStore((state) => state.previewMode);

  const [leftWidth, setLeftWidth] = useState(232);
  const [rightWidth, setRightWidth] = useState(288);

  // In preview mode the chrome gets out of the way so the design is judged on
  // its own terms.
  const showLeft = leftOpen && !previewMode;
  const showRight = rightOpen && !previewMode;
  const showBottom = bottomOpen && !previewMode;

  return (
    <div className="flex h-full flex-col overflow-hidden bg-surface-sunken">
      {toolbar}

      <div className="flex min-h-0 flex-1">
        {showLeft && (
          <>
            <aside
              className="flex shrink-0 flex-col overflow-hidden border-r border-edge bg-surface"
              style={{ width: leftWidth }}
            >
              {left}
            </aside>
            <ResizeHandle
              orientation="vertical"
              onDelta={(delta) =>
                setLeftWidth((current) => clamp(current + delta, LEFT_RANGE[0], LEFT_RANGE[1]))
              }
            />
          </>
        )}

        <main className="flex min-w-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 flex-col">{center}</div>

          {showBottom && (
            <>
              <ResizeHandle
                orientation="horizontal"
                onDelta={(delta) => setBottomHeight(bottomHeight - delta)}
              />
              <div className="shrink-0 overflow-hidden" style={{ height: bottomHeight }}>
                {bottom}
              </div>
            </>
          )}
        </main>

        {showRight && (
          <>
            <ResizeHandle
              orientation="vertical"
              onDelta={(delta) =>
                setRightWidth((current) => clamp(current - delta, RIGHT_RANGE[0], RIGHT_RANGE[1]))
              }
            />
            <aside
              className="flex shrink-0 flex-col overflow-hidden border-l border-edge bg-surface"
              style={{ width: rightWidth }}
            >
              {right}
            </aside>
          </>
        )}
      </div>

      {!previewMode && statusBar}
    </div>
  );
}

/**
 * A drag handle for resizing a pane.
 *
 * Pointer capture is what makes this reliable: without it, dragging quickly
 * moves the cursor off the 4px strip and the gesture dies mid-drag.
 */
function ResizeHandle({
  orientation,
  onDelta,
}: {
  orientation: 'vertical' | 'horizontal';
  onDelta: (delta: number) => void;
}) {
  const lastRef = useRef<number | null>(null);
  const [dragging, setDragging] = useState(false);

  const onPointerDown = useCallback((event: React.PointerEvent) => {
    event.preventDefault();
    lastRef.current = orientation === 'vertical' ? event.clientX : event.clientY;
    setDragging(true);
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }, [orientation]);

  const onPointerMove = useCallback(
    (event: React.PointerEvent) => {
      if (lastRef.current === null) return;
      const current = orientation === 'vertical' ? event.clientX : event.clientY;
      onDelta(current - lastRef.current);
      lastRef.current = current;
    },
    [orientation, onDelta],
  );

  const onPointerUp = useCallback((event: React.PointerEvent) => {
    lastRef.current = null;
    setDragging(false);
    try {
      (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
    } catch {
      /* already released */
    }
  }, []);

  return (
    <div
      role="separator"
      aria-orientation={orientation}
      className={clsx(
        'group relative shrink-0 bg-edge transition-colors',
        orientation === 'vertical' ? 'w-px cursor-col-resize' : 'h-px cursor-row-resize',
        dragging && 'bg-accent',
      )}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {/* An invisible wider hit area — a 1px target is unusable. */}
      <span
        className={clsx(
          'absolute',
          orientation === 'vertical' ? '-inset-x-1 inset-y-0' : '-inset-y-1 inset-x-0',
        )}
      />
    </div>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
