/**
 * The single seam between frontend and backend.
 *
 * Every framework-specific concern lives behind these calls. If you are looking
 * for "where does the frontend know about Tkinter" — it doesn't, and this file
 * is the proof: it only ever passes generator *ids* it was given by the server.
 */

import type {
  CatalogResponse,
  ExportFormat,
  GenerateResponse,
  GeneratorDescriptor,
  TemplateDescriptor,
  ValidateResponse,
} from '@/types/catalog';
import type { Project } from '@/types/project';
import { apiBaseUrl } from './config';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${apiBaseUrl()}${path}`;
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      ...init,
    });
  } catch {
    // A network-level failure here is almost always one of three things, and
    // naming them beats a bare "failed to fetch".
    throw new ApiError(unreachableMessage(url), 0);
  }

  if (!response.ok) {
    throw new ApiError(await readError(response), response.status);
  }
  return (await response.json()) as T;
}

function unreachableMessage(url: string): string {
  if (!url.startsWith('/')) {
    return (
      `Cannot reach the GUIForge backend at ${new URL(url).origin}. ` +
      'Check that the URL in config.json is correct, that the backend is awake ' +
      '(free hosts sleep when idle and can take a minute to start), and that ' +
      "this site's address is listed in the backend's GUIFORGE_ALLOWED_ORIGINS."
    );
  }

  // Same-origin, but we are not on a dev machine — this is almost certainly a
  // static upload whose config.json was never filled in. Saying "is it running
  // on port 8000?" would send the user hunting for the wrong problem.
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);
  if (!local) {
    return (
      'No backend is configured. This looks like a static deployment, so it ' +
      'needs the address of a running GUIForge backend: set "apiBaseUrl" in ' +
      'config.json next to index.html, then re-upload that file.'
    );
  }

  return 'Cannot reach the GUIForge backend. Is it running on port 8000?';
}

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: string };
    return body.detail ?? `Request failed (${response.status})`;
  } catch {
    return `Request failed (${response.status})`;
  }
}

export const api = {
  getCatalog: () => request<CatalogResponse>('/catalog'),

  getGenerators: () =>
    request<{ generators: GeneratorDescriptor[] }>('/generators').then((r) => r.generators),

  getTemplates: () => request<TemplateDescriptor[]>('/templates'),

  getTemplate: (id: string) => request<Project>(`/templates/${id}`),

  generate: (project: Project, generator: string, signal?: AbortSignal) =>
    request<GenerateResponse>('/generate', {
      method: 'POST',
      body: JSON.stringify({ project, generator }),
      signal,
    }),

  validate: (project: Project, signal?: AbortSignal) =>
    request<ValidateResponse>('/validate', {
      method: 'POST',
      body: JSON.stringify({ project }),
      signal,
    }),

  /** Run a document from disk through the backend's migration chain. */
  loadProject: (document: unknown) =>
    request<Project>('/projects/load', {
      method: 'POST',
      body: JSON.stringify({ document }),
    }),

  /** Downloads are streamed as blobs, so this bypasses the JSON helper. */
  async exportProject(
    project: Project,
    generator: string,
    format: ExportFormat,
    options: { includeProject?: boolean; includeTheme?: boolean; includeAssets?: boolean } = {},
  ): Promise<{ blob: Blob; filename: string }> {
    const response = await fetch(`${apiBaseUrl()}/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project,
        generator,
        format,
        includeProject: options.includeProject ?? true,
        includeTheme: options.includeTheme ?? true,
        includeAssets: options.includeAssets ?? true,
      }),
    });

    if (!response.ok) {
      throw new ApiError(await readError(response), response.status);
    }

    return {
      blob: await response.blob(),
      filename:
        filenameFrom(response.headers.get('content-disposition')) ??
        fallbackFilename(project, generator, format),
    };
  },
};

/**
 * Read the server-suggested filename.
 *
 * Cross-origin this returns null unless the backend sends
 * `Access-Control-Expose-Headers: Content-Disposition` — which it does — but
 * the fallback keeps downloads sensibly named even if a proxy strips it.
 */
function filenameFrom(disposition: string | null): string | null {
  return disposition?.match(/filename="([^"]+)"/)?.[1] ?? null;
}

function fallbackFilename(project: Project, generator: string, format: ExportFormat): string {
  const slug =
    project.project.name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'project';

  switch (format) {
    case 'zip':
      return `${slug}-${generator}.zip`;
    case 'json':
      return `${slug}.guiforge.json`;
    case 'theme':
      return `${slug}-theme.json`;
    case 'source':
      return 'main.py';
  }
}

/** Trigger a browser download for a blob returned by `exportProject`. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
