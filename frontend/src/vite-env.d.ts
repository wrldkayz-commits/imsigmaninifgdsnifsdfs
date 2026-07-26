/// <reference types="vite/client" />

/** Build-time environment variables this app understands. */
interface ImportMetaEnv {
  /** Optional default backend URL; see `src/api/config.ts`. */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
