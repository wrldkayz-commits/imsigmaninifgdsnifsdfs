/**
 * Where the backend lives.
 *
 * Two deployment shapes have to work from the same build:
 *
 *   1. **Single service** — FastAPI serves this bundle from its own origin, so
 *      the API is simply at `/api`. Nothing to configure.
 *   2. **Split** — the bundle sits on a static host (Cloudflare Pages, Netlify,
 *      S3) and the API is on a different origin entirely.
 *
 * For the split case the URL is read from `config.json` *at runtime* rather than
 * baked in at build time. That means the folder can be re-uploaded to point at a
 * different backend by editing one line — no toolchain, no rebuild. A
 * build-time `VITE_API_BASE_URL` is honoured as the default, and same-origin
 * `/api` is the fallback, so the single-service deployment keeps working with
 * no config file present at all.
 */

const BUILD_TIME_DEFAULT = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '';

let resolvedBase = normalise(BUILD_TIME_DEFAULT) || '/api';

export interface RuntimeConfig {
  apiBaseUrl?: string;
}

/**
 * Read `config.json` if present and adopt its `apiBaseUrl`.
 *
 * Called once before the app renders. A missing or malformed file is not an
 * error — it just means "use the same origin", which is the single-service
 * case and by far the common one.
 */
export async function loadRuntimeConfig(): Promise<void> {
  try {
    // `cache: no-store` matters: the whole point is that editing this file and
    // re-uploading takes effect immediately, not after a cache expires.
    const response = await fetch('config.json', { cache: 'no-store' });
    if (!response.ok) return;

    const config = (await response.json()) as RuntimeConfig;
    const configured = normalise(config.apiBaseUrl ?? '');
    if (configured) resolvedBase = configured;
  } catch {
    // No config.json, or it is not JSON. Same-origin it is.
  }
}

export const apiBaseUrl = (): string => resolvedBase;

/**
 * Trim trailing slashes and append `/api` when the user gave only an origin.
 *
 * People naturally paste `https://my-app.onrender.com`, so accepting that and
 * appending the path removes the single most likely configuration mistake.
 */
function normalise(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  if (trimmed === '/api' || trimmed.endsWith('/api')) return trimmed;
  return `${trimmed}/api`;
}
