/**
 * Command palette (Ctrl+Shift+P).
 *
 * Searches the same command registry the toolbar and shortcuts use, plus the
 * widget catalog — so typing a widget name adds it, which is the fastest way to
 * build a layout without touching the mouse.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import clsx from 'clsx';
import { CornerDownLeft, Search } from 'lucide-react';
import type { Command } from '@/lib/commands';
import { filterCommands } from '@/lib/commands';
import { searchSpecs, useCatalogStore } from '@/store/catalogStore';
import { useProjectStore } from '@/store/projectStore';
import { useUiStore } from '@/store/uiStore';
import { WidgetIcon } from '@/components/ui/WidgetIcon';

interface CommandPaletteProps {
  commands: Command[];
}

export function CommandPalette({ commands }: CommandPaletteProps) {
  const open = useUiStore((state) => state.commandPaletteOpen);
  const setOpen = useUiStore((state) => state.setCommandPaletteOpen);
  const specs = useCatalogStore((state) => state.specs);
  const addWidget = useProjectStore((state) => state.addWidget);
  const project = useProjectStore((state) => state.project);

  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
      // The dialog animates in; focus after the frame so it lands reliably.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const entries = useMemo(() => {
    const matched = filterCommands(commands, query).map((command) => ({
      kind: 'command' as const,
      command,
    }));

    const widgets = query.trim()
      ? searchSpecs(specs, query)
          .slice(0, 6)
          .map((spec) => ({ kind: 'widget' as const, spec }))
      : [];

    return [...matched, ...widgets];
  }, [commands, specs, query]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  // Keep the highlighted row in view while arrowing through a long list.
  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const run = (index: number) => {
    const entry = entries[index];
    if (!entry) return;

    if (entry.kind === 'command') {
      setOpen(false);
      void entry.command.run();
      return;
    }

    const root = project.widgets.find((widget) => widget.type === 'window');
    const [width, height] = entry.spec.defaultSize;
    addWidget(entry.spec, root?.id ?? null, {
      x: Math.round((project.window.width - width) / 2),
      y: Math.round((project.window.height - height) / 2),
    });
    setOpen(false);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((current) => (current + 1) % Math.max(1, entries.length));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((current) => (current - 1 + entries.length) % Math.max(1, entries.length));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      run(active);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[12vh] backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Command palette"
            className="w-full max-w-xl overflow-hidden rounded-xl border border-edge bg-surface shadow-float"
            initial={{ opacity: 0, y: -12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.14, ease: 'easeOut' }}
            onKeyDown={onKeyDown}
          >
            <div className="flex items-center gap-2 border-b border-edge px-3">
              <Search size={15} className="shrink-0 text-ink-muted" />
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Type a command or widget name…"
                aria-label="Command"
                className="h-11 w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-muted"
              />
            </div>

            <div ref={listRef} className="max-h-[50vh] overflow-y-auto p-1">
              {entries.length === 0 && (
                <p className="px-3 py-8 text-center text-xs text-ink-muted">
                  No commands match “{query}”.
                </p>
              )}

              {entries.map((entry, index) => (
                <button
                  key={entry.kind === 'command' ? entry.command.id : `widget-${entry.spec.type}`}
                  type="button"
                  data-index={index}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => run(index)}
                  className={clsx(
                    'flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-xs',
                    index === active ? 'bg-accent-soft text-accent' : 'text-ink',
                  )}
                >
                  {entry.kind === 'command' ? (
                    <>
                      {entry.command.icon ? (
                        <entry.command.icon size={14} className="shrink-0 opacity-70" />
                      ) : (
                        <span className="w-3.5 shrink-0" />
                      )}
                      <span className="min-w-0 flex-1 truncate">{entry.command.title}</span>
                      <span className="shrink-0 text-2xs uppercase tracking-wide opacity-50">
                        {entry.command.section}
                      </span>
                      {entry.command.shortcut && (
                        <kbd className="shrink-0 rounded border border-edge px-1.5 py-0.5 font-mono text-2xs text-ink-muted">
                          {entry.command.shortcut}
                        </kbd>
                      )}
                    </>
                  ) : (
                    <>
                      <WidgetIcon name={entry.spec.icon} size={14} className="shrink-0 opacity-70" />
                      <span className="min-w-0 flex-1 truncate">
                        Add {entry.spec.label}
                      </span>
                      <span className="shrink-0 text-2xs uppercase tracking-wide opacity-50">
                        Widget
                      </span>
                    </>
                  )}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-3 border-t border-edge px-3 py-1.5 text-2xs text-ink-muted">
              <span className="flex items-center gap-1">
                <CornerDownLeft size={11} /> to run
              </span>
              <span>↑↓ to navigate</span>
              <span>esc to close</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
