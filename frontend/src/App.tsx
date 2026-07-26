/**
 * Application root: wires the stores, panels and cross-cutting effects together.
 *
 * Everything framework-specific arrives over the API, so this component knows
 * about panels and commands but nothing about Tkinter, Qt or ImGui.
 */

import { useCallback, useEffect, useState } from 'react';
import clsx from 'clsx';
import { Layers, SlidersHorizontal } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { StatusBar } from '@/components/layout/StatusBar';
import { TopToolbar } from '@/components/toolbar/TopToolbar';
import { WidgetLibrary } from '@/components/library/WidgetLibrary';
import { Canvas } from '@/components/canvas/Canvas';
import { Inspector } from '@/components/inspector/Inspector';
import { LayerTree } from '@/components/inspector/LayerTree';
import { BottomPanel } from '@/components/panels/BottomPanel';
import { CommandPalette } from '@/components/command/CommandPalette';
import { ExportDialog } from '@/components/dialogs/ExportDialog';
import { TemplateDialog } from '@/components/dialogs/TemplateDialog';
import { useCommands } from '@/hooks/useCommands';
import { useLiveGeneration } from '@/hooks/useLiveGeneration';
import { useCatalogStore } from '@/store/catalogStore';
import { useProjectStore } from '@/store/projectStore';
import { useUiStore } from '@/store/uiStore';
import { readAutosave, writeAutosave } from '@/lib/persist';
import { countWidgets } from '@/lib/tree';

export default function App() {
  const [exportOpen, setExportOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);

  const loadCatalog = useCatalogStore((state) => state.load);
  const catalogError = useCatalogStore((state) => state.error);
  const catalogLoading = useCatalogStore((state) => state.loading);

  const theme = useUiStore((state) => state.theme);
  const log = useUiStore((state) => state.log);

  const onExport = useCallback(() => setExportOpen(true), []);
  const onTemplates = useCallback(() => setTemplatesOpen(true), []);
  const commands = useCommands({ onExport, onTemplates });
  const { result, error, pending } = useLiveGeneration();

  // -- startup --------------------------------------------------------------

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  // Offer to restore an autosave, but only if it is newer than this session's
  // empty document — silently clobbering a fresh start would be worse.
  useEffect(() => {
    const saved = readAutosave();
    if (!saved) return;
    const widgets = countWidgets(saved.document.widgets) - 1;
    if (widgets <= 0) return;

    const when = new Date(saved.savedAt).toLocaleString();
    if (confirm(`Restore your autosaved project "${saved.document.project.name}" from ${when}?`)) {
      useProjectStore.getState().loadProject(saved.document);
      log('info', 'Restored the autosaved project.', 'autosave');
    }
    // Intentionally runs once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -- theme ----------------------------------------------------------------

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  // -- autosave -------------------------------------------------------------

  const revision = useProjectStore((state) => state.revision);
  const autosaveEnabled = useUiStore((state) => state.autosaveEnabled);

  useEffect(() => {
    if (!autosaveEnabled) return;
    const timer = window.setTimeout(() => {
      writeAutosave(useProjectStore.getState().project);
    }, 2000);
    return () => window.clearTimeout(timer);
  }, [revision, autosaveEnabled]);

  // -- unsaved-changes guard ------------------------------------------------

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!useProjectStore.getState().dirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  if (catalogError) return <BackendUnavailable message={catalogError} onRetry={loadCatalog} />;

  return (
    <>
      <AppShell
        toolbar={<TopToolbar commands={commands} onExport={onExport} onTemplates={onTemplates} />}
        left={<WidgetLibrary />}
        center={<Canvas />}
        right={<RightPanel />}
        bottom={<BottomPanel generation={result} generationError={error} pending={pending} />}
        statusBar={<StatusBar />}
      />

      <CommandPalette commands={commands} />
      <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} />
      <TemplateDialog open={templatesOpen} onClose={() => setTemplatesOpen(false)} />

      {catalogLoading && (
        <div className="pointer-events-none fixed inset-x-0 top-11 z-40 flex justify-center">
          <span className="rounded-b-md bg-accent px-3 py-1 text-2xs text-white">
            Loading widget catalog…
          </span>
        </div>
      )}
    </>
  );
}

/**
 * The right pane holds two views of the same tree — the layer list and the
 * property inspector — split so both are visible at once, which is how people
 * actually work.
 */
function RightPanel() {
  const [tab, setTab] = useState<'properties' | 'layers'>('properties');

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-9 shrink-0 items-center gap-0.5 border-b border-edge px-1">
        {(
          [
            ['properties', 'Properties', SlidersHorizontal],
            ['layers', 'Layers', Layers],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={clsx(
              'flex h-7 flex-1 items-center justify-center gap-1.5 rounded text-xs transition-colors',
              tab === id ? 'bg-surface-sunken font-medium text-ink' : 'text-ink-muted hover:text-ink',
            )}
          >
            <Icon size={12} />
            {label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1">{tab === 'properties' ? <Inspector /> : <LayerTree />}</div>
    </div>
  );
}

function BackendUnavailable({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
      <div>
        <h1 className="text-lg font-semibold text-ink">Backend unavailable</h1>
        <p className="mt-1 max-w-md text-sm text-ink-muted">{message}</p>
      </div>
      <pre className="rounded-lg border border-edge bg-surface px-4 py-3 text-left font-mono text-xs text-ink-muted">
        cd backend{'\n'}uvicorn main:app --reload --port 8000
      </pre>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-md bg-accent px-4 py-2 text-xs font-medium text-white hover:opacity-90"
      >
        Retry
      </button>
    </div>
  );
}
