/**
 * Export dialog.
 *
 * The framework list is rendered straight from `/api/generators` — including
 * "planned" entries, which appear disabled. When a planned generator is
 * implemented on the backend it becomes selectable here with no frontend
 * change, which is the whole point of the plugin architecture.
 */

import { useState } from 'react';
import clsx from 'clsx';
import { FileArchive, FileCode2, FileJson, Palette } from 'lucide-react';
import type { ExportFormat } from '@/types/catalog';
import { api, downloadBlob } from '@/api/client';
import { useCatalogStore } from '@/store/catalogStore';
import { useProjectStore } from '@/store/projectStore';
import { useUiStore } from '@/store/uiStore';
import { Badge, Toggle } from '@/components/ui/primitives';
import { Modal, PrimaryButton, SecondaryButton } from './Modal';

const FORMATS: {
  id: ExportFormat;
  label: string;
  description: string;
  icon: typeof FileArchive;
}[] = [
  {
    id: 'zip',
    label: 'Complete project (ZIP)',
    description: 'Sources, project file, theme, assets and a README.',
    icon: FileArchive,
  },
  {
    id: 'source',
    label: 'Source file only',
    description: 'Just the generated entry-point file.',
    icon: FileCode2,
  },
  {
    id: 'json',
    label: 'Project JSON',
    description: 'The editable design document.',
    icon: FileJson,
  },
  {
    id: 'theme',
    label: 'Theme JSON',
    description: 'Design tokens, importable into another project.',
    icon: Palette,
  },
];

export function ExportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const project = useProjectStore((state) => state.project);
  const generators = useCatalogStore((state) => state.generators);
  const generator = useUiStore((state) => state.generator);
  const setGenerator = useUiStore((state) => state.setGenerator);
  const log = useUiStore((state) => state.log);

  const [format, setFormat] = useState<ExportFormat>('zip');
  const [includeProject, setIncludeProject] = useState(true);
  const [includeTheme, setIncludeTheme] = useState(true);
  const [includeAssets, setIncludeAssets] = useState(true);
  const [busy, setBusy] = useState(false);

  const exportNow = async () => {
    setBusy(true);
    try {
      const { blob, filename } = await api.exportProject(project, generator, format, {
        includeProject,
        includeTheme,
        includeAssets,
      });
      downloadBlob(blob, filename);
      log('success', `Exported ${filename}.`, 'export');
      onClose();
    } catch (error) {
      log('error', error instanceof Error ? error.message : 'Export failed.', 'export');
    } finally {
      setBusy(false);
    }
  };

  const needsGenerator = format === 'zip' || format === 'source';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Export project"
      description="Choose a target framework and what to include."
      footer={
        <>
          <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
          <PrimaryButton onClick={exportNow} disabled={busy}>
            {busy ? 'Exporting…' : 'Export'}
          </PrimaryButton>
        </>
      }
    >
      <div className="space-y-5 p-4">
        <section>
          <h3 className="mb-2 text-2xs font-semibold uppercase tracking-wider text-ink-muted">
            Format
          </h3>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {FORMATS.map(({ id, label, description, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setFormat(id)}
                className={clsx(
                  'flex items-start gap-2.5 rounded-lg border p-2.5 text-left transition-colors',
                  format === id
                    ? 'border-accent bg-accent-soft'
                    : 'border-edge hover:border-ink-muted/40',
                )}
              >
                <Icon size={16} className={clsx('mt-0.5 shrink-0', format === id && 'text-accent')} />
                <span className="min-w-0">
                  <span className="block text-xs font-medium text-ink">{label}</span>
                  <span className="block text-2xs leading-snug text-ink-muted">{description}</span>
                </span>
              </button>
            ))}
          </div>
        </section>

        {needsGenerator && (
          <section>
            <h3 className="mb-2 text-2xs font-semibold uppercase tracking-wider text-ink-muted">
              Target framework
            </h3>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {generators.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  disabled={!entry.available}
                  onClick={() => setGenerator(entry.id)}
                  title={entry.description}
                  className={clsx(
                    'flex flex-col gap-1 rounded-lg border p-2.5 text-left transition-colors',
                    generator === entry.id && entry.available
                      ? 'border-accent bg-accent-soft'
                      : 'border-edge hover:border-ink-muted/40',
                    !entry.available && 'cursor-not-allowed opacity-45',
                  )}
                >
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-xs font-medium text-ink">{entry.label}</span>
                    {entry.status === 'beta' && <Badge tone="warn">beta</Badge>}
                    {!entry.available && <Badge>planned</Badge>}
                  </span>
                  <span className="text-2xs text-ink-muted">{entry.languageLabel}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        {format === 'zip' && (
          <section>
            <h3 className="mb-2 text-2xs font-semibold uppercase tracking-wider text-ink-muted">
              Include
            </h3>
            <div className="space-y-2">
              <Toggle
                checked={includeProject}
                onCheckedChange={setIncludeProject}
                label="Project file (so the design can be reopened)"
              />
              <Toggle checked={includeTheme} onCheckedChange={setIncludeTheme} label="Theme JSON" />
              <Toggle
                checked={includeAssets}
                onCheckedChange={setIncludeAssets}
                label="Assets (images referenced by the design)"
              />
            </div>
          </section>
        )}
      </div>
    </Modal>
  );
}
