/**
 * The application toolbar.
 *
 * Buttons dispatch through the shared command registry rather than calling the
 * store directly, so a toolbar button and its keyboard shortcut can never drift
 * apart.
 */

import clsx from 'clsx';
import {
  Download,
  Eye,
  FilePlus2,
  FolderOpen,
  Grid3x3,
  LayoutTemplate,
  Magnet,
  Moon,
  PanelBottom,
  PanelLeft,
  PanelRight,
  Redo2,
  Ruler,
  Save,
  Sun,
  Undo2,
} from 'lucide-react';
import type { Command } from '@/lib/commands';
import { useCatalogStore } from '@/store/catalogStore';
import { useProjectStore } from '@/store/projectStore';
import { useUiStore } from '@/store/uiStore';
import { Divider, IconButton } from '@/components/ui/primitives';

interface TopToolbarProps {
  commands: Command[];
  onExport: () => void;
  onTemplates: () => void;
}

export function TopToolbar({ commands, onExport, onTemplates }: TopToolbarProps) {
  const run = (id: string) => {
    const command = commands.find((entry) => entry.id === id);
    if (command) void command.run();
  };

  const projectName = useProjectStore((state) => state.project.project.name);
  const dirty = useProjectStore((state) => state.dirty);
  const canUndo = useProjectStore((state) => state.history.past.length > 0);
  const canRedo = useProjectStore((state) => state.history.future.length > 0);

  const generators = useCatalogStore((state) => state.generators);
  const generator = useUiStore((state) => state.generator);
  const setGenerator = useUiStore((state) => state.setGenerator);

  const theme = useUiStore((state) => state.theme);
  const toggleTheme = useUiStore((state) => state.toggleTheme);
  const previewMode = useUiStore((state) => state.previewMode);
  const togglePreview = useUiStore((state) => state.togglePreview);

  const showGrid = useUiStore((state) => state.showGrid);
  const toggleGrid = useUiStore((state) => state.toggleGrid);
  const snapToGrid = useUiStore((state) => state.snapToGrid);
  const toggleSnapToGrid = useUiStore((state) => state.toggleSnapToGrid);
  const showRulers = useUiStore((state) => state.showRulers);
  const toggleRulers = useUiStore((state) => state.toggleRulers);

  const leftOpen = useUiStore((state) => state.leftPanelOpen);
  const rightOpen = useUiStore((state) => state.rightPanelOpen);
  const bottomOpen = useUiStore((state) => state.bottomPanelOpen);
  const toggleLeft = useUiStore((state) => state.toggleLeftPanel);
  const toggleRight = useUiStore((state) => state.toggleRightPanel);
  const toggleBottom = useUiStore((state) => state.toggleBottomPanel);

  const available = generators.filter((entry) => entry.available);
  const planned = generators.filter((entry) => !entry.available);

  return (
    <header className="flex h-11 shrink-0 items-center gap-1 border-b border-edge bg-surface px-2">
      <div className="flex items-center gap-1.5 pr-1">
        <div className="grid h-6 w-6 place-items-center rounded bg-accent text-2xs font-bold text-white">
          GF
        </div>
        <span className="hidden text-xs font-semibold text-ink sm:inline">GUIForge</span>
      </div>

      <Divider vertical />

      <IconButton icon={<FilePlus2 size={14} />} label="New project (Ctrl+N)" onClick={() => run('file.new')} />
      <IconButton icon={<FolderOpen size={14} />} label="Open project (Ctrl+O)" onClick={() => run('file.open')} />
      <IconButton icon={<Save size={14} />} label="Save project (Ctrl+S)" onClick={() => run('file.save')} />
      <IconButton icon={<LayoutTemplate size={14} />} label="Templates (Ctrl+Shift+N)" onClick={onTemplates} />

      <Divider vertical />

      <IconButton
        icon={<Undo2 size={14} />}
        label="Undo (Ctrl+Z)"
        disabled={!canUndo}
        onClick={() => run('edit.undo')}
      />
      <IconButton
        icon={<Redo2 size={14} />}
        label="Redo (Ctrl+Shift+Z)"
        disabled={!canRedo}
        onClick={() => run('edit.redo')}
      />

      <Divider vertical />

      <IconButton
        icon={<Grid3x3 size={14} />}
        label="Show grid"
        active={showGrid}
        onClick={toggleGrid}
      />
      <IconButton
        icon={<Magnet size={14} />}
        label="Snap to grid"
        active={snapToGrid}
        onClick={toggleSnapToGrid}
      />
      <IconButton
        icon={<Ruler size={14} />}
        label="Show rulers (Ctrl+R)"
        active={showRulers}
        onClick={toggleRulers}
      />

      {/* Centre: the project name, which doubles as the dirty indicator. */}
      <div className="mx-2 flex min-w-0 flex-1 items-center justify-center gap-1.5">
        <span className="truncate text-xs font-medium text-ink">{projectName}</span>
        {dirty && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-warn" title="Unsaved changes" />}
      </div>

      <label className="sr-only" htmlFor="generator-select">
        Target framework
      </label>
      <select
        id="generator-select"
        value={generator}
        onChange={(event) => setGenerator(event.target.value)}
        title="Target framework — the generated code updates instantly"
        className="input h-7 w-auto max-w-[160px] cursor-pointer font-medium"
      >
        <optgroup label="Available">
          {available.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.label}
            </option>
          ))}
        </optgroup>
        {planned.length > 0 && (
          <optgroup label="Planned">
            {planned.map((entry) => (
              <option key={entry.id} value={entry.id} disabled>
                {entry.label} ({entry.languageLabel})
              </option>
            ))}
          </optgroup>
        )}
      </select>

      <IconButton
        icon={<Download size={14} />}
        label="Export (Ctrl+E)"
        onClick={onExport}
      />

      <Divider vertical />

      <button
        type="button"
        onClick={togglePreview}
        className={clsx('toolbar-button', previewMode && 'toolbar-button-active')}
        title="Live preview (P)"
      >
        <Eye size={14} />
        Preview
      </button>

      <IconButton
        icon={theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
        label="Toggle theme"
        onClick={toggleTheme}
      />

      <Divider vertical />

      <IconButton
        icon={<PanelLeft size={14} />}
        label="Toggle widget library (Ctrl+1)"
        active={leftOpen}
        onClick={toggleLeft}
      />
      <IconButton
        icon={<PanelBottom size={14} />}
        label="Toggle bottom panel (Ctrl+`)"
        active={bottomOpen}
        onClick={toggleBottom}
      />
      <IconButton
        icon={<PanelRight size={14} />}
        label="Toggle properties (Ctrl+2)"
        active={rightOpen}
        onClick={toggleRight}
      />
    </header>
  );
}
