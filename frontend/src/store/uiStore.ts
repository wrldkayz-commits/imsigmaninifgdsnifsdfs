/**
 * Editor state that is *not* part of the document.
 *
 * Zoom, panel layout, the active framework and the editor theme all belong
 * here: they change constantly, they should never appear on the undo stack, and
 * they persist across projects. The split from `projectStore` is what keeps
 * "undo" meaning "undo my design change".
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type BottomTab = 'code' | 'console' | 'json' | 'errors' | 'preview';
export type EditorTheme = 'light' | 'dark';
export type Tool = 'select' | 'pan';

export interface ConsoleEntry {
  id: number;
  level: 'info' | 'warning' | 'error' | 'success';
  message: string;
  at: number;
  source: string;
}

export const ZOOM_LEVELS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];
export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 5;

interface UiState {
  theme: EditorTheme;
  tool: Tool;

  zoom: number;
  pan: { x: number; y: number };

  showGrid: boolean;
  snapToGrid: boolean;
  snapToObjects: boolean;
  gridSize: number;
  showRulers: boolean;
  showOutlines: boolean;

  leftPanelOpen: boolean;
  rightPanelOpen: boolean;
  bottomPanelOpen: boolean;
  bottomPanelHeight: number;
  bottomTab: BottomTab;

  /** Live preview hides selection chrome and disables editing interactions. */
  previewMode: boolean;

  generator: string;
  commandPaletteOpen: boolean;
  librarySearch: string;

  console: ConsoleEntry[];
  autosaveEnabled: boolean;
}

interface UiActions {
  setTheme: (theme: EditorTheme) => void;
  toggleTheme: () => void;
  setTool: (tool: Tool) => void;

  setZoom: (zoom: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  zoomToFit: (contentSize: { width: number; height: number }, viewport: { width: number; height: number }) => void;
  resetView: () => void;
  setPan: (pan: { x: number; y: number }) => void;
  panBy: (dx: number, dy: number) => void;

  toggleGrid: () => void;
  toggleSnapToGrid: () => void;
  toggleSnapToObjects: () => void;
  setGridSize: (size: number) => void;
  toggleRulers: () => void;
  toggleOutlines: () => void;

  toggleLeftPanel: () => void;
  toggleRightPanel: () => void;
  toggleBottomPanel: () => void;
  setBottomPanelHeight: (height: number) => void;
  setBottomTab: (tab: BottomTab) => void;

  togglePreview: () => void;
  setGenerator: (generator: string) => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setLibrarySearch: (query: string) => void;

  log: (level: ConsoleEntry['level'], message: string, source?: string) => void;
  clearConsole: () => void;
  toggleAutosave: () => void;
}

let consoleId = 0;
const CONSOLE_LIMIT = 300;

export const useUiStore = create<UiState & UiActions>()(
  persist(
    (set, get) => ({
      theme: 'dark',
      tool: 'select',

      zoom: 1,
      pan: { x: 0, y: 0 },

      showGrid: true,
      snapToGrid: true,
      snapToObjects: true,
      gridSize: 8,
      showRulers: true,
      showOutlines: false,

      leftPanelOpen: true,
      rightPanelOpen: true,
      bottomPanelOpen: true,
      bottomPanelHeight: 260,
      bottomTab: 'code',

      previewMode: false,

      generator: 'tkinter',
      commandPaletteOpen: false,
      librarySearch: '',

      console: [],
      autosaveEnabled: true,

      setTheme: (theme) => set({ theme }),
      toggleTheme: () => set({ theme: get().theme === 'dark' ? 'light' : 'dark' }),
      setTool: (tool) => set({ tool }),

      setZoom: (zoom) => set({ zoom: clamp(zoom, MIN_ZOOM, MAX_ZOOM) }),

      zoomIn: () => {
        const current = get().zoom;
        const next = ZOOM_LEVELS.find((level) => level > current + 0.001);
        set({ zoom: next ?? MAX_ZOOM });
      },

      zoomOut: () => {
        const current = get().zoom;
        const next = [...ZOOM_LEVELS].reverse().find((level) => level < current - 0.001);
        set({ zoom: next ?? MIN_ZOOM });
      },

      zoomToFit: (contentSize, viewport) => {
        const padding = 80;
        const scale = Math.min(
          (viewport.width - padding) / Math.max(1, contentSize.width),
          (viewport.height - padding) / Math.max(1, contentSize.height),
        );
        const zoom = clamp(scale, MIN_ZOOM, 1);
        set({
          zoom,
          pan: {
            x: (viewport.width - contentSize.width * zoom) / 2,
            y: (viewport.height - contentSize.height * zoom) / 2,
          },
        });
      },

      resetView: () => set({ zoom: 1, pan: { x: 0, y: 0 } }),
      setPan: (pan) => set({ pan }),
      panBy: (dx, dy) => set((state) => ({ pan: { x: state.pan.x + dx, y: state.pan.y + dy } })),

      toggleGrid: () => set((state) => ({ showGrid: !state.showGrid })),
      toggleSnapToGrid: () => set((state) => ({ snapToGrid: !state.snapToGrid })),
      toggleSnapToObjects: () => set((state) => ({ snapToObjects: !state.snapToObjects })),
      setGridSize: (gridSize) => set({ gridSize: clamp(Math.round(gridSize), 1, 128) }),
      toggleRulers: () => set((state) => ({ showRulers: !state.showRulers })),
      toggleOutlines: () => set((state) => ({ showOutlines: !state.showOutlines })),

      toggleLeftPanel: () => set((state) => ({ leftPanelOpen: !state.leftPanelOpen })),
      toggleRightPanel: () => set((state) => ({ rightPanelOpen: !state.rightPanelOpen })),
      toggleBottomPanel: () => set((state) => ({ bottomPanelOpen: !state.bottomPanelOpen })),
      setBottomPanelHeight: (height) => set({ bottomPanelHeight: clamp(height, 120, 640) }),
      setBottomTab: (bottomTab) => set({ bottomTab, bottomPanelOpen: true }),

      togglePreview: () => set((state) => ({ previewMode: !state.previewMode })),
      setGenerator: (generator) => set({ generator }),
      setCommandPaletteOpen: (commandPaletteOpen) => set({ commandPaletteOpen }),
      setLibrarySearch: (librarySearch) => set({ librarySearch }),

      log: (level, message, source = 'app') =>
        set((state) => {
          consoleId += 1;
          const entry: ConsoleEntry = { id: consoleId, level, message, at: Date.now(), source };
          const next = [...state.console, entry];
          return { console: next.length > CONSOLE_LIMIT ? next.slice(-CONSOLE_LIMIT) : next };
        }),

      clearConsole: () => set({ console: [] }),
      toggleAutosave: () => set((state) => ({ autosaveEnabled: !state.autosaveEnabled })),
    }),
    {
      name: 'guiforge.ui',
      // Transient state must not survive a reload: a persisted "preview mode"
      // or a stale console would be confusing on next launch.
      partialize: (state) => ({
        theme: state.theme,
        showGrid: state.showGrid,
        snapToGrid: state.snapToGrid,
        snapToObjects: state.snapToObjects,
        gridSize: state.gridSize,
        showRulers: state.showRulers,
        showOutlines: state.showOutlines,
        leftPanelOpen: state.leftPanelOpen,
        rightPanelOpen: state.rightPanelOpen,
        bottomPanelOpen: state.bottomPanelOpen,
        bottomPanelHeight: state.bottomPanelHeight,
        bottomTab: state.bottomTab,
        generator: state.generator,
        autosaveEnabled: state.autosaveEnabled,
      }),
    },
  ),
);

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
