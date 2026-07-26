/**
 * The catalog and generator registry, fetched once at startup.
 *
 * Everything the UI knows about widget types and frameworks arrives through
 * here. If the backend gains a widget or a generator — including from a plugin
 * — it shows up on the next load with no frontend change.
 */

import { create } from 'zustand';
import { api } from '@/api/client';
import type {
  GeneratorDescriptor,
  TemplateDescriptor,
  WidgetCategory,
  WidgetSpec,
} from '@/types/catalog';

interface CatalogState {
  specs: WidgetSpec[];
  specsByType: Map<string, WidgetSpec>;
  generators: GeneratorDescriptor[];
  templates: TemplateDescriptor[];
  loading: boolean;
  error: string | null;
  load: () => Promise<void>;
}

export const useCatalogStore = create<CatalogState>((set) => ({
  specs: [],
  specsByType: new Map(),
  generators: [],
  templates: [],
  loading: true,
  error: null,

  load: async () => {
    set({ loading: true, error: null });
    try {
      const [catalog, generators, templates] = await Promise.all([
        api.getCatalog(),
        api.getGenerators(),
        api.getTemplates(),
      ]);

      set({
        specs: catalog.widgets,
        specsByType: new Map(catalog.widgets.map((spec) => [spec.type, spec])),
        generators,
        templates,
        loading: false,
      });
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to load the widget catalog.',
      });
    }
  },
}));

/** Look up a spec without subscribing a component to the whole catalog. */
export const getSpec = (type: string): WidgetSpec | undefined =>
  useCatalogStore.getState().specsByType.get(type);

export const CATEGORY_ORDER: WidgetCategory[] = [
  'Containers',
  'Inputs',
  'Buttons',
  'Display',
  'Navigation',
  'Media',
  'Advanced',
  'Custom',
];

/** Group specs by category, honouring a stable display order. */
export function groupByCategory(specs: WidgetSpec[]): [WidgetCategory, WidgetSpec[]][] {
  const groups = new Map<WidgetCategory, WidgetSpec[]>();
  for (const spec of specs) {
    if (spec.rootOnly) continue; // the Window is created with the project
    const bucket = groups.get(spec.category);
    if (bucket) bucket.push(spec);
    else groups.set(spec.category, [spec]);
  }

  const known = CATEGORY_ORDER.filter((category) => groups.has(category)).map(
    (category) => [category, groups.get(category)!] as [WidgetCategory, WidgetSpec[]],
  );
  // Categories contributed by plugins are appended rather than dropped.
  const extra = [...groups.entries()].filter(
    ([category]) => !CATEGORY_ORDER.includes(category),
  );
  return [...known, ...extra];
}

/** Fuzzy-ish search across label, type, description and keywords. */
export function searchSpecs(specs: WidgetSpec[], query: string): WidgetSpec[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return specs;

  return specs
    .map((spec) => ({ spec, score: scoreSpec(spec, needle) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.spec);
}

function scoreSpec(spec: WidgetSpec, needle: string): number {
  const label = spec.label.toLowerCase();
  if (label === needle) return 100;
  if (label.startsWith(needle)) return 80;
  if (label.includes(needle)) return 60;
  if (spec.type.toLowerCase().includes(needle)) return 50;
  if (spec.keywords.some((keyword) => keyword.toLowerCase().includes(needle))) return 40;
  if (spec.description.toLowerCase().includes(needle)) return 20;
  return 0;
}
