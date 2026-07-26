/**
 * The project document format.
 *
 * These interfaces mirror `backend/models/schema.py` one-for-one. The backend
 * serialises camelCase specifically so this file needs no translation layer —
 * what the API sends is what these types describe, and what gets written to a
 * `.guiforge.json` file.
 */

export const SCHEMA_VERSION = 1;

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Box {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export type Anchor =
  | 'top-left'
  | 'top'
  | 'top-right'
  | 'left'
  | 'center'
  | 'right'
  | 'bottom-left'
  | 'bottom'
  | 'bottom-right'
  | 'fill';

export type EventName =
  | 'click'
  | 'doubleClick'
  | 'hover'
  | 'keyPress'
  | 'mouseEnter'
  | 'mouseLeave'
  | 'change'
  | 'focus'
  | 'blur'
  | 'windowOpen'
  | 'windowClose';

export interface Font {
  family: string;
  size: number;
  weight: 'normal' | 'bold';
  style: 'normal' | 'italic';
  underline: boolean;
}

export interface Appearance {
  font: Font;
  color: string | null;
  background: string | null;
  borderColor: string | null;
  borderWidth: number;
  radius: number;
  opacity: number;
}

export interface Layout {
  position: Point;
  size: Size;
  anchor: Anchor;
  padding: Box;
  margin: Box;
}

export interface Behavior {
  visible: boolean;
  enabled: boolean;
  focusable: boolean;
  tabOrder: number | null;
  locked: boolean;
}

/** Type-specific values, keyed by the `PropDef.key`s the catalog declares. */
export type WidgetProps = Record<string, unknown>;

export interface Widget {
  id: string;
  type: string;
  name: string;
  text: string;
  tooltip: string;
  layout: Layout;
  appearance: Appearance;
  behavior: Behavior;
  props: WidgetProps;
  events: Partial<Record<EventName, string>>;
  children: Widget[];
}

export interface WindowSpec {
  title: string;
  width: number;
  height: number;
  resizable: boolean;
  background: string;
  minWidth: number | null;
  minHeight: number | null;
}

export interface ThemeSpec {
  name: string;
  mode: 'light' | 'dark';
  tokens: Record<string, string>;
}

export interface ProjectMeta {
  name: string;
  version: number;
  author: string;
  description: string;
}

export interface Project {
  schemaVersion: number;
  project: ProjectMeta;
  window: WindowSpec;
  theme: ThemeSpec;
  widgets: Widget[];
  assets: Record<string, string>;
}

// --- factories ---------------------------------------------------------------

export const defaultFont = (): Font => ({
  family: 'Segoe UI',
  size: 12,
  weight: 'normal',
  style: 'normal',
  underline: false,
});

export const defaultAppearance = (): Appearance => ({
  font: defaultFont(),
  color: null,
  background: null,
  borderColor: null,
  borderWidth: 0,
  radius: 0,
  opacity: 1,
});

export const defaultBox = (): Box => ({ top: 0, right: 0, bottom: 0, left: 0 });

export const defaultLayout = (): Layout => ({
  position: { x: 0, y: 0 },
  size: { width: 100, height: 30 },
  anchor: 'top-left',
  padding: defaultBox(),
  margin: defaultBox(),
});

export const defaultBehavior = (): Behavior => ({
  visible: true,
  enabled: true,
  focusable: true,
  tabOrder: null,
  locked: false,
});

export const defaultTheme = (): ThemeSpec => ({
  name: 'Default Light',
  mode: 'light',
  tokens: {
    primary: '#3b82f6',
    surface: '#ffffff',
    background: '#f5f5f5',
    text: '#111827',
    muted: '#6b7280',
    border: '#e5e7eb',
  },
});

export const createEmptyProject = (name = 'Untitled Project'): Project => ({
  schemaVersion: SCHEMA_VERSION,
  project: { name, version: 1, author: '', description: '' },
  window: {
    title: name,
    width: 1024,
    height: 640,
    resizable: true,
    background: '#f5f6f8',
    minWidth: null,
    minHeight: null,
  },
  theme: defaultTheme(),
  widgets: [
    {
      id: 'window_root',
      type: 'window',
      name: 'MainWindow',
      text: name,
      tooltip: '',
      layout: { ...defaultLayout(), size: { width: 1024, height: 640 } },
      appearance: defaultAppearance(),
      behavior: defaultBehavior(),
      props: { resizable: true, centered: true },
      events: {},
      children: [],
    },
  ],
  assets: {},
});
