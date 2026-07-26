/**
 * Opening, saving, autosave and recent projects.
 *
 * Files are read and written through the browser: `showSaveFilePicker` where
 * available (Chromium) so "Save" overwrites the same file without a download
 * prompt, falling back to a download + `<input type=file>` everywhere else.
 *
 * Loading always round-trips through the backend so old documents get migrated
 * to the current schema — the frontend deliberately owns no migration logic.
 */

import { api } from '@/api/client';
import type { Project } from '@/types/project';

const AUTOSAVE_KEY = 'guiforge.autosave';
const RECENTS_KEY = 'guiforge.recents';
const MAX_RECENTS = 10;

export interface RecentProject {
  name: string;
  savedAt: number;
  widgetCount: number;
  /** The document itself, so a recent entry can be reopened without the file. */
  document: Project;
}

// --- file system ---------------------------------------------------------------

interface FileSystemHandleLike {
  createWritable: () => Promise<{ write: (data: string) => Promise<void>; close: () => Promise<void> }>;
  getFile: () => Promise<File>;
  name: string;
}

let currentHandle: FileSystemHandleLike | null = null;

const hasFileSystemAccess = (): boolean =>
  typeof window !== 'undefined' && 'showSaveFilePicker' in window;

const PICKER_TYPES = [
  {
    description: 'GUIForge project',
    accept: { 'application/json': ['.json', '.guiforge.json'] },
  },
];

export async function saveProject(project: Project, forceNewFile = false): Promise<string> {
  const json = JSON.stringify(project, null, 2);
  const suggested = `${slug(project.project.name)}.guiforge.json`;

  if (hasFileSystemAccess()) {
    try {
      if (forceNewFile || !currentHandle) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        currentHandle = await (window as any).showSaveFilePicker({
          suggestedName: suggested,
          types: PICKER_TYPES,
        });
      }
      const writable = await currentHandle!.createWritable();
      await writable.write(json);
      await writable.close();
      return currentHandle!.name;
    } catch (error) {
      // A user cancelling the picker is not an error worth surfacing.
      if (error instanceof DOMException && error.name === 'AbortError') throw error;
      // Anything else falls through to the download path.
    }
  }

  downloadText(json, suggested, 'application/json');
  return suggested;
}

export async function openProject(): Promise<{ project: Project; name: string } | null> {
  if (hasFileSystemAccess()) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const [handle] = await (window as any).showOpenFilePicker({ types: PICKER_TYPES });
      if (!handle) return null;
      currentHandle = handle;
      const file = await handle.getFile();
      return { project: await parseAndMigrate(await file.text()), name: file.name };
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return null;
    }
  }

  const file = await pickFile('.json,.guiforge.json,application/json');
  if (!file) return null;
  return { project: await parseAndMigrate(await file.text()), name: file.name };
}

export function forgetFileHandle(): void {
  currentHandle = null;
}

export const hasOpenFile = (): boolean => currentHandle !== null;

async function parseAndMigrate(text: string): Promise<Project> {
  const raw: unknown = JSON.parse(text);
  // Accept both a bare document and the wrapper produced by "Export JSON".
  const document =
    typeof raw === 'object' && raw !== null && 'document' in raw
      ? (raw as { document: unknown }).document
      : raw;
  return api.loadProject(document);
}

function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    // `oncancel` is not universally supported; the promise simply never
    // resolves if the user cancels, which is harmless here.
    input.click();
  });
}

export function downloadText(content: string, filename: string, mime = 'text/plain'): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

// --- autosave ------------------------------------------------------------------

export function writeAutosave(project: Project): void {
  try {
    localStorage.setItem(
      AUTOSAVE_KEY,
      JSON.stringify({ savedAt: Date.now(), document: project }),
    );
  } catch {
    // Quota exceeded on a very large design; autosave is best-effort.
  }
}

export function readAutosave(): { savedAt: number; document: Project } | null {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    return raw ? (JSON.parse(raw) as { savedAt: number; document: Project }) : null;
  } catch {
    return null;
  }
}

export function clearAutosave(): void {
  localStorage.removeItem(AUTOSAVE_KEY);
}

// --- recents -------------------------------------------------------------------

export function readRecents(): RecentProject[] {
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    return raw ? (JSON.parse(raw) as RecentProject[]) : [];
  } catch {
    return [];
  }
}

export function pushRecent(project: Project, widgetCount: number): void {
  const entry: RecentProject = {
    name: project.project.name,
    savedAt: Date.now(),
    widgetCount,
    document: project,
  };

  const existing = readRecents().filter((recent) => recent.name !== entry.name);
  try {
    localStorage.setItem(
      RECENTS_KEY,
      JSON.stringify([entry, ...existing].slice(0, MAX_RECENTS)),
    );
  } catch {
    // Dropping the oldest entries is the safe response to a full quota.
    try {
      localStorage.setItem(RECENTS_KEY, JSON.stringify([entry]));
    } catch {
      /* give up silently */
    }
  }
}

function slug(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'project'
  );
}

// --- theme import/export --------------------------------------------------------

export function exportTheme(project: Project): void {
  downloadText(
    JSON.stringify(project.theme, null, 2),
    `${slug(project.project.name)}-theme.json`,
    'application/json',
  );
}

export async function importTheme(): Promise<Project['theme'] | null> {
  const file = await pickFile('.json,application/json');
  if (!file) return null;

  const parsed: unknown = JSON.parse(await file.text());
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('tokens' in parsed) ||
    typeof (parsed as { tokens: unknown }).tokens !== 'object'
  ) {
    throw new Error('That file does not look like a GUIForge theme.');
  }
  return parsed as Project['theme'];
}
