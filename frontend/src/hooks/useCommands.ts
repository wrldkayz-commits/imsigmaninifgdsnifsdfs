/**
 * Builds the command list and wires it to the keyboard.
 *
 * Commands are defined once and consumed by the toolbar, the palette and the
 * global key handler. Arrow-key nudging is handled separately because it is
 * continuous rather than a discrete command.
 */

import { useCallback, useEffect, useMemo } from 'react';
import {
  AlignHorizontalJustifyCenter,
  Copy,
  ClipboardPaste,
  Download,
  Eye,
  FilePlus2,
  FolderOpen,
  Grid3x3,
  Group,
  Lock,
  Maximize,
  Redo2,
  Save,
  Scissors,
  Trash2,
  Ungroup,
  Undo2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { Command } from '@/lib/commands';
import { isEditableTarget, matchesShortcut } from '@/lib/commands';
import { findWidget, topLevelOf } from '@/lib/tree';
import type { Widget } from '@/types/project';
import { useProjectStore } from '@/store/projectStore';
import { useUiStore } from '@/store/uiStore';
import {
  forgetFileHandle,
  openProject,
  pushRecent,
  saveProject,
} from '@/lib/persist';
import { countWidgets } from '@/lib/tree';

/** The clipboard lives outside React: it survives re-renders and unmounts. */
let clipboard: Widget[] = [];

export function useCommands(options: { onExport: () => void; onTemplates: () => void }) {
  const { onExport, onTemplates } = options;

  const store = useProjectStore;
  const ui = useUiStore;

  const copySelection = useCallback(() => {
    const { project, selection } = store.getState();
    const ids = topLevelOf(project.widgets, selection);
    clipboard = ids
      .map((id) => findWidget(project.widgets, id))
      .filter((widget): widget is Widget => widget !== null);
    if (clipboard.length > 0) {
      ui.getState().log('info', `Copied ${clipboard.length} widget(s).`, 'edit');
    }
  }, [store, ui]);

  const commands = useMemo<Command[]>(() => {
    const project = () => store.getState();
    const uiState = () => ui.getState();

    return [
      // -- file ---------------------------------------------------------------
      {
        id: 'file.new',
        title: 'New Project',
        section: 'File',
        shortcut: 'Ctrl+N',
        icon: FilePlus2,
        run: () => {
          if (project().dirty && !confirm('Discard unsaved changes?')) return;
          forgetFileHandle();
          project().newProject();
          uiState().log('info', 'Started a new project.', 'file');
        },
      },
      {
        id: 'file.open',
        title: 'Open Project…',
        section: 'File',
        shortcut: 'Ctrl+O',
        icon: FolderOpen,
        run: async () => {
          try {
            const opened = await openProject();
            if (!opened) return;
            project().loadProject(opened.project, opened.name);
            uiState().log('success', `Opened ${opened.name}.`, 'file');
          } catch (error) {
            uiState().log(
              'error',
              error instanceof Error ? error.message : 'Could not open that file.',
              'file',
            );
          }
        },
      },
      {
        id: 'file.save',
        title: 'Save Project',
        section: 'File',
        shortcut: 'Ctrl+S',
        icon: Save,
        run: async () => {
          try {
            const current = project().project;
            const name = await saveProject(current);
            project().markSaved(name);
            pushRecent(current, countWidgets(current.widgets));
            uiState().log('success', `Saved ${name}.`, 'file');
          } catch (error) {
            if (error instanceof DOMException && error.name === 'AbortError') return;
            uiState().log('error', 'Save failed.', 'file');
          }
        },
      },
      {
        id: 'file.saveAs',
        title: 'Save Project As…',
        section: 'File',
        shortcut: 'Ctrl+Shift+S',
        icon: Save,
        run: async () => {
          try {
            const current = project().project;
            const name = await saveProject(current, true);
            project().markSaved(name);
            uiState().log('success', `Saved ${name}.`, 'file');
          } catch (error) {
            if (error instanceof DOMException && error.name === 'AbortError') return;
            uiState().log('error', 'Save failed.', 'file');
          }
        },
      },
      {
        id: 'file.export',
        title: 'Export…',
        section: 'File',
        shortcut: 'Ctrl+E',
        icon: Download,
        run: onExport,
      },
      {
        id: 'file.templates',
        title: 'Browse Templates…',
        section: 'File',
        shortcut: 'Ctrl+Shift+N',
        keywords: ['starter', 'example', 'sample'],
        run: onTemplates,
      },

      // -- edit ---------------------------------------------------------------
      {
        id: 'edit.undo',
        title: 'Undo',
        section: 'Edit',
        shortcut: 'Ctrl+Z',
        icon: Undo2,
        enabled: () => project().canUndo(),
        run: () => project().undo(),
      },
      {
        id: 'edit.redo',
        title: 'Redo',
        section: 'Edit',
        shortcut: 'Ctrl+Shift+Z',
        icon: Redo2,
        enabled: () => project().canRedo(),
        run: () => project().redo(),
      },
      {
        id: 'edit.copy',
        title: 'Copy',
        section: 'Edit',
        shortcut: 'Ctrl+C',
        icon: Copy,
        run: copySelection,
      },
      {
        id: 'edit.cut',
        title: 'Cut',
        section: 'Edit',
        shortcut: 'Ctrl+X',
        icon: Scissors,
        run: () => {
          copySelection();
          project().deleteSelected();
        },
      },
      {
        id: 'edit.paste',
        title: 'Paste',
        section: 'Edit',
        shortcut: 'Ctrl+V',
        icon: ClipboardPaste,
        run: () => {
          const state = project();
          const root = state.project.widgets.find((widget) => widget.type === 'window');
          state.paste(clipboard, root?.id ?? null);
        },
      },
      {
        id: 'edit.duplicate',
        title: 'Duplicate',
        section: 'Edit',
        shortcut: 'Ctrl+D',
        run: () => project().duplicateSelected(),
      },
      {
        id: 'edit.delete',
        title: 'Delete',
        section: 'Edit',
        shortcut: 'Delete',
        icon: Trash2,
        run: () => project().deleteSelected(),
      },
      {
        id: 'edit.selectAll',
        title: 'Select All',
        section: 'Edit',
        shortcut: 'Ctrl+A',
        run: () => project().selectAll(),
      },
      {
        id: 'edit.group',
        title: 'Group Selection',
        section: 'Arrange',
        shortcut: 'Ctrl+G',
        icon: Group,
        run: () => project().group(),
      },
      {
        id: 'edit.ungroup',
        title: 'Ungroup',
        section: 'Arrange',
        shortcut: 'Ctrl+Shift+G',
        icon: Ungroup,
        run: () => project().ungroup(),
      },
      {
        id: 'edit.lock',
        title: 'Toggle Lock',
        section: 'Arrange',
        shortcut: 'Ctrl+L',
        icon: Lock,
        run: () => {
          const state = project();
          const first = state.selection[0]
            ? findWidget(state.project.widgets, state.selection[0])
            : null;
          state.setLocked(state.selection, !(first?.behavior.locked ?? false));
        },
      },
      {
        id: 'edit.hide',
        title: 'Toggle Visibility',
        section: 'Arrange',
        shortcut: 'Ctrl+H',
        run: () => {
          const state = project();
          const first = state.selection[0]
            ? findWidget(state.project.widgets, state.selection[0])
            : null;
          state.setVisible(state.selection, !(first?.behavior.visible ?? true));
        },
      },
      {
        id: 'arrange.forward',
        title: 'Bring Forward',
        section: 'Arrange',
        shortcut: 'Ctrl+]',
        run: () => {
          const state = project();
          state.selection.forEach((id) => state.reorder(id, 'forward'));
        },
      },
      {
        id: 'arrange.backward',
        title: 'Send Backward',
        section: 'Arrange',
        shortcut: 'Ctrl+[',
        run: () => {
          const state = project();
          state.selection.forEach((id) => state.reorder(id, 'backward'));
        },
      },
      {
        id: 'arrange.front',
        title: 'Bring to Front',
        section: 'Arrange',
        run: () => {
          const state = project();
          state.selection.forEach((id) => state.reorder(id, 'front'));
        },
      },
      {
        id: 'arrange.back',
        title: 'Send to Back',
        section: 'Arrange',
        run: () => {
          const state = project();
          state.selection.forEach((id) => state.reorder(id, 'back'));
        },
      },
      {
        id: 'arrange.alignLeft',
        title: 'Align Left',
        section: 'Arrange',
        icon: AlignHorizontalJustifyCenter,
        run: () => project().align('left'),
      },
      {
        id: 'arrange.alignCenter',
        title: 'Align Horizontal Centres',
        section: 'Arrange',
        run: () => project().align('centerX'),
      },
      {
        id: 'arrange.alignTop',
        title: 'Align Top',
        section: 'Arrange',
        run: () => project().align('top'),
      },
      {
        id: 'arrange.distributeH',
        title: 'Distribute Horizontally',
        section: 'Arrange',
        run: () => project().distribute('horizontal'),
      },
      {
        id: 'arrange.distributeV',
        title: 'Distribute Vertically',
        section: 'Arrange',
        run: () => project().distribute('vertical'),
      },

      // -- view ---------------------------------------------------------------
      {
        id: 'view.preview',
        title: 'Toggle Live Preview',
        section: 'View',
        shortcut: 'P',
        icon: Eye,
        run: () => {
          uiState().togglePreview();
          uiState().log(
            'info',
            uiState().previewMode ? 'Preview started.' : 'Preview stopped.',
            'preview',
          );
        },
      },
      {
        id: 'view.theme',
        title: 'Toggle Editor Theme',
        section: 'View',
        shortcut: 'Ctrl+Shift+T',
        run: () => uiState().toggleTheme(),
      },
      {
        id: 'view.zoomIn',
        title: 'Zoom In',
        section: 'View',
        shortcut: 'Ctrl+=',
        icon: ZoomIn,
        run: () => uiState().zoomIn(),
      },
      {
        id: 'view.zoomOut',
        title: 'Zoom Out',
        section: 'View',
        shortcut: 'Ctrl+-',
        icon: ZoomOut,
        run: () => uiState().zoomOut(),
      },
      {
        id: 'view.zoomReset',
        title: 'Reset Zoom',
        section: 'View',
        shortcut: 'Ctrl+0',
        icon: Maximize,
        run: () => uiState().resetView(),
      },
      {
        id: 'view.grid',
        title: 'Toggle Grid',
        section: 'View',
        shortcut: "Ctrl+'",
        icon: Grid3x3,
        run: () => uiState().toggleGrid(),
      },
      {
        id: 'view.snap',
        title: 'Toggle Snap to Grid',
        section: 'View',
        run: () => uiState().toggleSnapToGrid(),
      },
      {
        id: 'view.rulers',
        title: 'Toggle Rulers',
        section: 'View',
        shortcut: 'Ctrl+R',
        run: () => uiState().toggleRulers(),
      },
      {
        id: 'view.outlines',
        title: 'Toggle Widget Outlines',
        section: 'View',
        run: () => uiState().toggleOutlines(),
      },
      {
        id: 'view.leftPanel',
        title: 'Toggle Widget Library',
        section: 'View',
        shortcut: 'Ctrl+1',
        run: () => uiState().toggleLeftPanel(),
      },
      {
        id: 'view.rightPanel',
        title: 'Toggle Properties Panel',
        section: 'View',
        shortcut: 'Ctrl+2',
        run: () => uiState().toggleRightPanel(),
      },
      {
        id: 'view.bottomPanel',
        title: 'Toggle Bottom Panel',
        section: 'View',
        shortcut: 'Ctrl+`',
        run: () => uiState().toggleBottomPanel(),
      },
    ];
  }, [store, ui, copySelection, onExport, onTemplates]);

  // -- global key handling ---------------------------------------------------

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;

      const uiState = useUiStore.getState();

      // The palette owns its own keys while open.
      if (uiState.commandPaletteOpen) return;

      if (matchesShortcut(event, 'Ctrl+Shift+P')) {
        event.preventDefault();
        uiState.setCommandPaletteOpen(true);
        return;
      }

      if (event.key === 'Escape') {
        useProjectStore.getState().clearSelection();
        return;
      }

      // Arrow keys nudge; Shift makes it a coarse nudge.
      if (event.key.startsWith('Arrow')) {
        const state = useProjectStore.getState();
        if (state.selection.length === 0) return;
        event.preventDefault();

        const step = event.shiftKey ? uiState.gridSize * 2 : uiState.snapToGrid ? uiState.gridSize : 1;
        const delta = {
          ArrowLeft: [-step, 0],
          ArrowRight: [step, 0],
          ArrowUp: [0, -step],
          ArrowDown: [0, step],
        }[event.key] ?? [0, 0];

        state.moveSelectedBy(delta[0], delta[1], 'nudge');
        return;
      }

      for (const command of commands) {
        if (!command.shortcut) continue;
        if (!matchesShortcut(event, command.shortcut)) continue;
        if (command.enabled && !command.enabled()) return;
        event.preventDefault();
        void command.run();
        return;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [commands]);

  return commands;
}
