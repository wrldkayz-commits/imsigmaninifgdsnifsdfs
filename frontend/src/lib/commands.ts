/**
 * The command registry.
 *
 * Every user-facing action is defined once here, then surfaced by the toolbar,
 * the keyboard shortcut handler and the command palette. That single definition
 * is what keeps the three in sync: a new command is automatically searchable
 * and bindable without touching any of them.
 */

import type { LucideIcon } from 'lucide-react';

export interface Command {
  id: string;
  title: string;
  section: string;
  /** Human-readable accelerator, e.g. `Ctrl+Shift+P`. */
  shortcut?: string;
  icon?: LucideIcon;
  keywords?: string[];
  run: () => void | Promise<void>;
  enabled?: () => boolean;
}

export type CommandFactory = () => Command[];

/** Match a keyboard event against a shortcut string like `Ctrl+Shift+K`. */
export function matchesShortcut(event: KeyboardEvent, shortcut: string): boolean {
  const parts = shortcut.toLowerCase().split('+').map((part) => part.trim());
  const key = parts[parts.length - 1];

  const wantsCtrl = parts.includes('ctrl') || parts.includes('cmd') || parts.includes('mod');
  const wantsShift = parts.includes('shift');
  const wantsAlt = parts.includes('alt');

  // Treat Cmd and Ctrl as the same modifier so one binding works on both
  // platforms.
  const hasCtrl = event.ctrlKey || event.metaKey;
  if (wantsCtrl !== hasCtrl) return false;
  if (wantsShift !== event.shiftKey) return false;
  if (wantsAlt !== event.altKey) return false;

  const pressed = event.key.toLowerCase();
  if (pressed === key) return true;
  // `event.key` for punctuation varies with layout; `code` is the stable
  // fallback for things like Delete, arrows and brackets.
  return event.code.toLowerCase() === `key${key}` || event.code.toLowerCase() === key;
}

/** Is the user typing? Shortcuts must not steal keys from a text field. */
export function isEditableTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element) return false;
  const tag = element.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    element.isContentEditable ||
    element.closest('.monaco-editor') !== null
  );
}

/** Rank commands for the palette: title matches beat keyword matches. */
export function filterCommands(commands: Command[], query: string): Command[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return commands;

  return commands
    .map((command) => {
      const title = command.title.toLowerCase();
      let score = 0;
      if (title.startsWith(needle)) score = 100;
      else if (title.includes(needle)) score = 70;
      else if (command.section.toLowerCase().includes(needle)) score = 40;
      else if (command.keywords?.some((keyword) => keyword.toLowerCase().includes(needle))) {
        score = 30;
      } else if (subsequence(title, needle)) score = 15;
      return { command, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.command);
}

/** Loose fuzzy match: do the query's letters appear in order? */
function subsequence(haystack: string, needle: string): boolean {
  let index = 0;
  for (const character of haystack) {
    if (character === needle[index]) index += 1;
    if (index === needle.length) return true;
  }
  return false;
}
