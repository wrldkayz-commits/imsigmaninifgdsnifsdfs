/**
 * Template browser.
 *
 * Templates come from the backend, so the list grows when a plugin registers
 * one. Opening a template replaces the current document, which is why the
 * unsaved-changes guard lives here rather than in the store.
 */

import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { api } from '@/api/client';
import { useCatalogStore } from '@/store/catalogStore';
import { useProjectStore } from '@/store/projectStore';
import { useUiStore } from '@/store/uiStore';
import { forgetFileHandle, readRecents } from '@/lib/persist';
import { Modal, PrimaryButton, SecondaryButton } from './Modal';

export function TemplateDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const templates = useCatalogStore((state) => state.templates);
  const loadProject = useProjectStore((state) => state.loadProject);
  const dirty = useProjectStore((state) => state.dirty);
  const log = useUiStore((state) => state.log);

  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const recents = useMemo(() => (open ? readRecents() : []), [open]);

  const categories = useMemo(() => {
    const groups = new Map<string, typeof templates>();
    for (const template of templates) {
      const bucket = groups.get(template.category);
      if (bucket) bucket.push(template);
      else groups.set(template.category, [template]);
    }
    return [...groups.entries()];
  }, [templates]);

  const openTemplate = async (id: string) => {
    if (dirty && !confirm('Opening a template will discard unsaved changes. Continue?')) return;

    setBusy(true);
    try {
      const project = await api.getTemplate(id);
      forgetFileHandle(); // the template is a new document, not the open file
      loadProject(project);
      log('success', `Loaded the ${project.project.name} template.`, 'template');
      onClose();
    } catch (error) {
      log('error', error instanceof Error ? error.message : 'Could not load template.', 'template');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Start from a template"
      description="Templates are complete, editable designs — a starting point, not a wizard."
      width="max-w-3xl"
      footer={
        <>
          <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
          <PrimaryButton disabled={!selected || busy} onClick={() => selected && openTemplate(selected)}>
            {busy ? 'Loading…' : 'Open template'}
          </PrimaryButton>
        </>
      }
    >
      <div className="space-y-5 p-4">
        {recents.length > 0 && (
          <section>
            <h3 className="mb-2 text-2xs font-semibold uppercase tracking-wider text-ink-muted">
              Recent projects
            </h3>
            <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
              {recents.map((recent) => (
                <button
                  key={`${recent.name}-${recent.savedAt}`}
                  type="button"
                  onClick={() => {
                    if (dirty && !confirm('Discard unsaved changes?')) return;
                    forgetFileHandle();
                    loadProject(recent.document);
                    onClose();
                  }}
                  className="rounded-lg border border-edge p-2.5 text-left transition-colors hover:border-accent"
                >
                  <span className="block truncate text-xs font-medium text-ink">{recent.name}</span>
                  <span className="block text-2xs text-ink-muted">
                    {recent.widgetCount} widgets · {new Date(recent.savedAt).toLocaleDateString()}
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}

        {categories.map(([category, entries]) => (
          <section key={category}>
            <h3 className="mb-2 text-2xs font-semibold uppercase tracking-wider text-ink-muted">
              {category}
            </h3>
            <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
              {entries.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => setSelected(template.id)}
                  onDoubleClick={() => openTemplate(template.id)}
                  className={clsx(
                    'flex flex-col gap-1 rounded-lg border p-3 text-left transition-colors',
                    selected === template.id
                      ? 'border-accent bg-accent-soft'
                      : 'border-edge hover:border-ink-muted/40',
                  )}
                >
                  <span className="text-xs font-medium text-ink">{template.name}</span>
                  <span className="text-2xs leading-snug text-ink-muted">
                    {template.description}
                  </span>
                </button>
              ))}
            </div>
          </section>
        ))}

        {templates.length === 0 && (
          <p className="py-8 text-center text-xs text-ink-muted">
            No templates available — is the backend running?
          </p>
        )}
      </div>
    </Modal>
  );
}
