/**
 * Live code generation and validation.
 *
 * The code panel must feel instant while the design is being dragged around,
 * but regenerating on every pointer move would flood the backend. The
 * compromise: debounce on the document `revision` counter, and abort the
 * in-flight request when a newer edit arrives so a slow response can never
 * overwrite a fresher one.
 */

import { useEffect, useRef, useState } from 'react';
import { ApiError, api } from '@/api/client';
import type { GenerateResponse, ValidateResponse } from '@/types/catalog';
import { useProjectStore } from '@/store/projectStore';
import { useUiStore } from '@/store/uiStore';

const DEBOUNCE_MS = 300;

export function useLiveGeneration() {
  const revision = useProjectStore((state) => state.revision);
  const generator = useUiStore((state) => state.generator);
  const log = useUiStore((state) => state.log);

  const [result, setResult] = useState<GenerateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);
  const lastErrorRef = useRef<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;

      setPending(true);
      try {
        const project = useProjectStore.getState().project;
        const response = await api.generate(project, generator, controller.signal);
        if (controller.signal.aborted) return;

        setResult(response);
        setError(null);
        lastErrorRef.current = null;

        for (const diagnostic of response.diagnostics) {
          if (diagnostic.level === 'error') {
            log('error', diagnostic.message, generator);
          }
        }
      } catch (caught) {
        if (controller.signal.aborted) return;
        const message =
          caught instanceof ApiError ? caught.message : 'Code generation failed.';
        setError(message);
        // Only log a given failure once; a broken backend would otherwise
        // produce one console line per keystroke.
        if (lastErrorRef.current !== message) {
          lastErrorRef.current = message;
          log('error', message, 'generate');
        }
      } finally {
        if (!controller.signal.aborted) setPending(false);
      }
    }, DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [revision, generator, log]);

  useEffect(() => () => controllerRef.current?.abort(), []);

  return { result, error, pending };
}

export function useLiveValidation() {
  const revision = useProjectStore((state) => state.revision);
  const [result, setResult] = useState<ValidateResponse | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    // Validation is slower-moving than code generation and nothing depends on
    // it being instantaneous, so it gets a longer debounce.
    const timer = window.setTimeout(async () => {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;

      try {
        const project = useProjectStore.getState().project;
        const response = await api.validate(project, controller.signal);
        if (!controller.signal.aborted) setResult(response);
      } catch {
        // The Errors panel simply keeps showing the previous result.
      }
    }, 600);

    return () => window.clearTimeout(timer);
  }, [revision]);

  useEffect(() => () => controllerRef.current?.abort(), []);

  return result;
}
