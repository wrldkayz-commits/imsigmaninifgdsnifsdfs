/**
 * The bottom dock: generated code, console, project JSON, errors and preview logs.
 *
 * The code tab is the centrepiece — it regenerates as the design changes, which
 * is the fastest feedback loop the app offers for "what will this actually
 * produce".
 */

import { useMemo, useState } from 'react';
import clsx from 'clsx';
import Editor from '@monaco-editor/react';
import {
  AlertTriangle,
  Braces,
  ChevronDown,
  Code2,
  Copy,
  FileWarning,
  Terminal,
  Trash2,
} from 'lucide-react';
import type { GenerateResponse, ValidationIssue } from '@/types/catalog';
import { useCatalogStore } from '@/store/catalogStore';
import { useProjectStore } from '@/store/projectStore';
import { useUiStore, type BottomTab } from '@/store/uiStore';
import { useLiveValidation } from '@/hooks/useLiveGeneration';
import { Badge, EmptyState } from '@/components/ui/primitives';

interface BottomPanelProps {
  generation: GenerateResponse | null;
  generationError: string | null;
  pending: boolean;
}

const TABS: { id: BottomTab; label: string; icon: typeof Code2 }[] = [
  { id: 'code', label: 'Generated Code', icon: Code2 },
  { id: 'console', label: 'Console', icon: Terminal },
  { id: 'json', label: 'Project JSON', icon: Braces },
  { id: 'errors', label: 'Errors', icon: FileWarning },
  { id: 'preview', label: 'Preview Logs', icon: AlertTriangle },
];

export function BottomPanel({ generation, generationError, pending }: BottomPanelProps) {
  const tab = useUiStore((state) => state.bottomTab);
  const setTab = useUiStore((state) => state.setBottomTab);
  const toggle = useUiStore((state) => state.toggleBottomPanel);
  const theme = useUiStore((state) => state.theme);

  const validation = useLiveValidation();
  const errorCount = (validation?.issues ?? []).filter((issue) => issue.level === 'error').length;
  const warningCount =
    (validation?.issues ?? []).filter((issue) => issue.level === 'warning').length +
    (validation?.accessibility ?? []).filter((issue) => issue.level === 'warning').length;

  return (
    <div className="flex h-full flex-col border-t border-edge bg-surface">
      <div className="flex h-9 shrink-0 items-center gap-0.5 border-b border-edge px-1">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={clsx(
              'flex h-7 items-center gap-1.5 rounded px-2.5 text-xs transition-colors',
              tab === id
                ? 'bg-surface-sunken font-medium text-ink'
                : 'text-ink-muted hover:text-ink',
            )}
          >
            <Icon size={12} />
            {label}
            {id === 'errors' && errorCount > 0 && <Badge tone="danger">{errorCount}</Badge>}
            {id === 'errors' && errorCount === 0 && warningCount > 0 && (
              <Badge tone="warn">{warningCount}</Badge>
            )}
          </button>
        ))}

        <div className="ml-auto flex items-center gap-1">
          {pending && tab === 'code' && (
            <span className="text-2xs text-ink-muted">generating…</span>
          )}
          <button
            type="button"
            onClick={toggle}
            aria-label="Collapse panel"
            className="toolbar-button px-1.5"
          >
            <ChevronDown size={14} />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1">
        {tab === 'code' && (
          <CodeTab generation={generation} error={generationError} theme={theme} />
        )}
        {tab === 'console' && <ConsoleTab />}
        {tab === 'json' && <JsonTab theme={theme} />}
        {tab === 'errors' && <ErrorsTab validation={validation} />}
        {tab === 'preview' && <PreviewLogsTab />}
      </div>
    </div>
  );
}

// --- code ----------------------------------------------------------------------

function CodeTab({
  generation,
  error,
  theme,
}: {
  generation: GenerateResponse | null;
  error: string | null;
  theme: 'light' | 'dark';
}) {
  const generators = useCatalogStore((state) => state.generators);
  const generatorId = useUiStore((state) => state.generator);
  const [activeFile, setActiveFile] = useState(0);
  const log = useUiStore((state) => state.log);

  const descriptor = generators.find((entry) => entry.id === generatorId);
  const files = generation?.files ?? [];
  const file = files[Math.min(activeFile, Math.max(0, files.length - 1))];

  if (error) {
    return <EmptyState title="Code generation unavailable" hint={error} />;
  }
  if (!file) {
    return <EmptyState title="No code yet" hint="Add a widget to the canvas to see generated source." />;
  }

  const copy = async () => {
    await navigator.clipboard.writeText(file.content);
    log('success', `Copied ${file.path} to the clipboard.`, 'code');
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-8 shrink-0 items-center gap-1 border-b border-edge px-2">
        {files.map((entry, index) => (
          <button
            key={entry.path}
            type="button"
            onClick={() => setActiveFile(index)}
            className={clsx(
              'rounded px-2 py-1 font-mono text-2xs',
              index === activeFile
                ? 'bg-accent-soft text-accent'
                : 'text-ink-muted hover:text-ink',
            )}
          >
            {entry.path}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2 text-2xs text-ink-muted">
          <span>
            {file.lineCount} lines · {generation?.durationMs.toFixed(0)} ms
          </span>
          {generation && generation.diagnostics.length > 0 && (
            <Badge tone="warn">{generation.diagnostics.length} notes</Badge>
          )}
          <button type="button" onClick={copy} className="toolbar-button px-1.5">
            <Copy size={12} />
            Copy
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1">
        <Editor
          height="100%"
          path={`${generatorId}/${file.path}`}
          language={descriptor?.monacoLanguage ?? 'python'}
          value={file.content}
          theme={theme === 'dark' ? 'vs-dark' : 'light'}
          options={{
            readOnly: true,
            minimap: { enabled: false },
            fontSize: 12,
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            renderLineHighlight: 'none',
            automaticLayout: true,
            padding: { top: 8 },
            fontFamily: 'JetBrains Mono, Cascadia Code, Consolas, monospace',
          }}
        />
      </div>

      {generation && generation.diagnostics.length > 0 && (
        <div className="max-h-24 shrink-0 overflow-y-auto border-t border-edge px-3 py-1.5">
          {generation.diagnostics.map((diagnostic, index) => (
            <p key={index} className="text-2xs leading-relaxed text-ink-muted">
              <span
                className={clsx(
                  'font-medium',
                  diagnostic.level === 'error' ? 'text-danger' : 'text-warn',
                )}
              >
                {diagnostic.level}
              </span>
              {' · '}
              {diagnostic.message}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

// --- console -------------------------------------------------------------------

function ConsoleTab() {
  const entries = useUiStore((state) => state.console);
  const clear = useUiStore((state) => state.clearConsole);

  if (entries.length === 0) {
    return <EmptyState title="Console is empty" hint="Actions and backend messages appear here." />;
  }

  const tone = {
    info: 'text-ink-muted',
    success: 'text-ok',
    warning: 'text-warn',
    error: 'text-danger',
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-7 shrink-0 items-center justify-end border-b border-edge px-2">
        <button type="button" onClick={clear} className="toolbar-button px-1.5">
          <Trash2 size={12} />
          Clear
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2 font-mono text-2xs leading-relaxed">
        {entries.map((entry) => (
          <div key={entry.id} className="flex gap-2">
            <span className="shrink-0 text-ink-muted/60">
              {new Date(entry.at).toLocaleTimeString()}
            </span>
            <span className="shrink-0 text-ink-muted/80">[{entry.source}]</span>
            <span className={clsx('min-w-0 break-words', tone[entry.level])}>{entry.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- project json --------------------------------------------------------------

function JsonTab({ theme }: { theme: 'light' | 'dark' }) {
  const project = useProjectStore((state) => state.project);
  const json = useMemo(() => JSON.stringify(project, null, 2), [project]);

  return (
    <Editor
      height="100%"
      path="project.guiforge.json"
      language="json"
      value={json}
      theme={theme === 'dark' ? 'vs-dark' : 'light'}
      options={{
        readOnly: true,
        minimap: { enabled: false },
        fontSize: 12,
        scrollBeyondLastLine: false,
        automaticLayout: true,
        padding: { top: 8 },
        fontFamily: 'JetBrains Mono, Cascadia Code, Consolas, monospace',
      }}
    />
  );
}

// --- errors / accessibility ----------------------------------------------------

function ErrorsTab({ validation }: { validation: ReturnType<typeof useLiveValidation> }) {
  const select = useProjectStore((state) => state.select);

  if (!validation) {
    return <EmptyState title="Checking…" hint="The project validator runs as you design." />;
  }

  const issues = [...validation.issues, ...validation.accessibility];
  if (issues.length === 0) {
    return (
      <EmptyState
        title="No problems found"
        hint="Validation and accessibility checks both pass for this design."
      />
    );
  }

  const order = { error: 0, warning: 1, info: 2 } as const;
  const sorted = [...issues].sort((a, b) => order[a.level] - order[b.level]);

  return (
    <div className="h-full overflow-y-auto p-1">
      {sorted.map((issue, index) => (
        <IssueRow
          key={`${issue.code}-${issue.widgetId ?? 'global'}-${index}`}
          issue={issue}
          onSelect={() => issue.widgetId && select([issue.widgetId])}
        />
      ))}
    </div>
  );
}

function IssueRow({ issue, onSelect }: { issue: ValidationIssue; onSelect: () => void }) {
  const tone = {
    error: 'text-danger',
    warning: 'text-warn',
    info: 'text-ink-muted',
  };

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={!issue.widgetId}
      className="flex w-full items-start gap-2 rounded px-2 py-1.5 text-left hover:bg-surface-sunken disabled:cursor-default"
    >
      <span className={clsx('mt-0.5 shrink-0 text-2xs font-semibold uppercase', tone[issue.level])}>
        {issue.level}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs leading-snug text-ink">{issue.message}</span>
        <span className="block text-2xs text-ink-muted">
          <span className="font-mono">{issue.code}</span>
          {issue.widgetName && ` · ${issue.widgetName}`}
        </span>
      </span>
    </button>
  );
}

// --- preview logs --------------------------------------------------------------

function PreviewLogsTab() {
  // Subscribe to the stable array and filter in a memo — filtering inside the
  // selector would return a fresh array every call and re-render forever.
  const console = useUiStore((state) => state.console);
  const previewMode = useUiStore((state) => state.previewMode);
  const entries = useMemo(
    () => console.filter((entry) => entry.source === 'preview'),
    [console],
  );

  if (entries.length === 0) {
    return (
      <EmptyState
        title={previewMode ? 'Preview running' : 'Preview not running'}
        hint="Interaction events captured during live preview are logged here."
      />
    );
  }

  return (
    <div className="h-full overflow-y-auto p-2 font-mono text-2xs leading-relaxed">
      {entries.map((entry) => (
        <div key={entry.id} className="flex gap-2">
          <span className="text-ink-muted/60">{new Date(entry.at).toLocaleTimeString()}</span>
          <span className="text-ink">{entry.message}</span>
        </div>
      ))}
    </div>
  );
}
