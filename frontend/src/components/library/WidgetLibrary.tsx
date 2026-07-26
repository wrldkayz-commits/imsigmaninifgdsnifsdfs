/**
 * The widget palette.
 *
 * Every entry comes from the backend catalog, so this component has no
 * knowledge of which widgets exist — including ones added by a plugin. Search
 * flattens the categories; otherwise they render as collapsible groups.
 */

import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { ChevronRight, Package, Search, X } from 'lucide-react';
import type { WidgetSpec } from '@/types/catalog';
import { groupByCategory, searchSpecs, useCatalogStore } from '@/store/catalogStore';
import { useProjectStore } from '@/store/projectStore';
import { useUiStore } from '@/store/uiStore';
import { WidgetIcon } from '@/components/ui/WidgetIcon';
import { LIBRARY_DRAG_TYPE } from './dragTypes';

export function WidgetLibrary() {
  const specs = useCatalogStore((state) => state.specs);
  const loading = useCatalogStore((state) => state.loading);
  const query = useUiStore((state) => state.librarySearch);
  const setQuery = useUiStore((state) => state.setLibrarySearch);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const searching = query.trim().length > 0;
  const results = useMemo(() => searchSpecs(specs, query), [specs, query]);
  const groups = useMemo(() => groupByCategory(results), [results]);

  const toggleCategory = (category: string) =>
    setCollapsed((previous) => {
      const next = new Set(previous);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-edge p-2">
        <div className="relative">
          <Search
            size={13}
            className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-ink-muted"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search widgets…"
            aria-label="Search widgets"
            className="input pl-7 pr-7"
          />
          {searching && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-ink-muted hover:text-ink"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pb-4">
        {loading && <LibrarySkeleton />}

        {!loading && results.length === 0 && (
          <p className="px-3 py-6 text-center text-xs text-ink-muted">
            No widgets match “{query}”.
          </p>
        )}

        {!loading &&
          (searching ? (
            <div className="grid grid-cols-2 gap-1 p-2">
              {results.map((spec) => (
                <LibraryItem key={spec.type} spec={spec} />
              ))}
            </div>
          ) : (
            groups.map(([category, categorySpecs]) => {
              const isCollapsed = collapsed.has(category);
              return (
                <section key={category}>
                  <button
                    type="button"
                    onClick={() => toggleCategory(category)}
                    aria-expanded={!isCollapsed}
                    className="section-title sticky top-0 z-10 bg-surface/95 backdrop-blur hover:text-ink"
                  >
                    <ChevronRight
                      size={12}
                      className={clsx('transition-transform', !isCollapsed && 'rotate-90')}
                    />
                    {category}
                    <span className="ml-auto font-normal normal-case tracking-normal opacity-60">
                      {categorySpecs.length}
                    </span>
                  </button>
                  {!isCollapsed && (
                    <div className="grid grid-cols-2 gap-1 px-2 pb-2">
                      {categorySpecs.map((spec) => (
                        <LibraryItem key={spec.type} spec={spec} />
                      ))}
                    </div>
                  )}
                </section>
              );
            })
          ))}
      </div>
    </div>
  );
}

function LibraryItem({ spec }: { spec: WidgetSpec }) {
  const addWidget = useProjectStore((state) => state.addWidget);
  const project = useProjectStore((state) => state.project);

  /**
   * Double-click adds the widget without a drag — the fastest path when you
   * know where it goes and will position it afterwards.
   */
  const addToCentre = () => {
    const root = project.widgets.find((widget) => widget.type === 'window');
    const [width, height] = spec.defaultSize;
    addWidget(spec, root?.id ?? null, {
      x: Math.round((project.window.width - width) / 2),
      y: Math.round((project.window.height - height) / 2),
    });
  };

  return (
    <button
      type="button"
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData(LIBRARY_DRAG_TYPE, spec.type);
        event.dataTransfer.effectAllowed = 'copy';
      }}
      onDoubleClick={addToCentre}
      title={`${spec.label}${spec.description ? ` — ${spec.description}` : ''}\nDrag onto the canvas, or double-click to add`}
      className="group flex cursor-grab flex-col items-center gap-1.5 rounded-md border border-transparent
                 bg-surface-raised px-2 py-2.5 text-center transition-colors
                 hover:border-accent/40 hover:bg-accent-soft active:cursor-grabbing"
    >
      <WidgetIcon
        name={spec.icon}
        size={16}
        className="text-ink-muted transition-colors group-hover:text-accent"
      />
      <span className="w-full truncate text-2xs font-medium leading-tight text-ink">
        {spec.label}
      </span>
    </button>
  );
}

function LibrarySkeleton() {
  return (
    <div className="grid grid-cols-2 gap-1 p-2" aria-hidden>
      {Array.from({ length: 10 }).map((_, index) => (
        <div key={index} className="h-14 animate-pulse rounded-md bg-surface-raised" />
      ))}
    </div>
  );
}

export function LibraryEmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
      <Package size={24} className="text-ink-muted" />
      <p className="text-xs text-ink-muted">
        The widget catalog could not be loaded. Check that the backend is running.
      </p>
    </div>
  );
}
