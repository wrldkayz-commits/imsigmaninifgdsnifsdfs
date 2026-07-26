/**
 * The bottom status strip: zoom controls, snap settings and live project stats.
 *
 * Deliberately dense — this is the readout a designer glances at, not a place
 * to discover features.
 */

import { Minus, Plus } from 'lucide-react';
import { useMemo } from 'react';
import { countWidgets } from '@/lib/tree';
import { useProjectStore } from '@/store/projectStore';
import { useUiStore, ZOOM_LEVELS } from '@/store/uiStore';

export function StatusBar() {
  const project = useProjectStore((state) => state.project);
  const selection = useProjectStore((state) => state.selection);
  const lastAction = useProjectStore((state) => state.lastAction);

  const zoom = useUiStore((state) => state.zoom);
  const setZoom = useUiStore((state) => state.setZoom);
  const zoomIn = useUiStore((state) => state.zoomIn);
  const zoomOut = useUiStore((state) => state.zoomOut);
  const resetView = useUiStore((state) => state.resetView);
  const gridSize = useUiStore((state) => state.gridSize);
  const setGridSize = useUiStore((state) => state.setGridSize);
  const snapToObjects = useUiStore((state) => state.snapToObjects);
  const toggleSnapToObjects = useUiStore((state) => state.toggleSnapToObjects);
  const autosaveEnabled = useUiStore((state) => state.autosaveEnabled);

  const widgetCount = useMemo(() => countWidgets(project.widgets) - 1, [project.widgets]);

  return (
    <footer className="flex h-6 shrink-0 items-center gap-3 border-t border-edge bg-surface px-2 text-2xs text-ink-muted">
      <span className="truncate">{lastAction}</span>

      <span className="ml-auto flex items-center gap-3">
        <span>
          {widgetCount} widget{widgetCount === 1 ? '' : 's'}
        </span>
        {selection.length > 0 && <span className="text-accent">{selection.length} selected</span>}
        <span>
          {project.window.width} × {project.window.height}
        </span>

        <label className="flex items-center gap-1">
          Grid
          <input
            type="number"
            min={1}
            max={128}
            value={gridSize}
            onChange={(event) => setGridSize(Number(event.target.value))}
            aria-label="Grid size"
            className="h-4 w-10 rounded border border-edge bg-surface-raised px-1 text-2xs text-ink"
          />
        </label>

        <button
          type="button"
          onClick={toggleSnapToObjects}
          className={snapToObjects ? 'text-accent' : 'hover:text-ink'}
          title="Snap to other widgets"
        >
          Smart guides
        </button>

        {autosaveEnabled && <span title="Autosave is on">Autosave</span>}

        <span className="flex items-center gap-0.5">
          <button type="button" onClick={zoomOut} aria-label="Zoom out" className="p-0.5 hover:text-ink">
            <Minus size={11} />
          </button>
          <select
            value={ZOOM_LEVELS.includes(zoom) ? zoom : ''}
            onChange={(event) => setZoom(Number(event.target.value))}
            aria-label="Zoom level"
            className="h-4 cursor-pointer border-0 bg-transparent text-2xs text-ink outline-none"
          >
            {!ZOOM_LEVELS.includes(zoom) && <option value="">{Math.round(zoom * 100)}%</option>}
            {ZOOM_LEVELS.map((level) => (
              <option key={level} value={level}>
                {Math.round(level * 100)}%
              </option>
            ))}
          </select>
          <button type="button" onClick={zoomIn} aria-label="Zoom in" className="p-0.5 hover:text-ink">
            <Plus size={11} />
          </button>
          <button type="button" onClick={resetView} className="pl-1 hover:text-ink" title="Reset view (Ctrl+0)">
            Reset
          </button>
        </span>
      </span>
    </footer>
  );
}
