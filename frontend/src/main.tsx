import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { loadRuntimeConfig } from './api/config';
import './index.css';

const container = document.getElementById('root');
if (!container) throw new Error('Root element #root is missing from index.html');

/**
 * Resolve the backend URL before the first render.
 *
 * Doing this up front — rather than lazily on the first request — means no
 * component ever has to handle "the API address is not known yet", and a
 * mis-typed URL surfaces as one clear error instead of a race.
 */
loadRuntimeConfig().finally(() => {
  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
