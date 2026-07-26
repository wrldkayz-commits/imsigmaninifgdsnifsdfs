/**
 * Building widgets from catalog specs.
 *
 * The factory is the only place a `Widget` is created from nothing, which is
 * what guarantees that a widget type introduced by a backend plugin gets the
 * same treatment as a built-in one — defaults, naming and props all come from
 * the spec rather than from a hard-coded table.
 */

import type { WidgetSpec } from '@/types/catalog';
import type { Widget } from '@/types/project';
import {
  defaultAppearance,
  defaultBehavior,
  defaultBox,
  defaultLayout,
} from '@/types/project';
import { walk } from './tree';

let counter = 0;

/** Ids only need to be unique within a document; a counter plus time suffices. */
export function nextId(prefix = 'widget'): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}`;
}

/** "button" -> "Button 3", counting existing widgets of the same type. */
export function suggestName(spec: WidgetSpec, existing: Widget[]): string {
  const base = spec.label.replace(/\s+/g, '');
  let index = 1;
  for (const widget of walk(existing)) {
    if (widget.type === spec.type) index += 1;
  }

  const taken = new Set([...walk(existing)].map((w) => w.name));
  let name = `${base}${index}`;
  while (taken.has(name)) {
    index += 1;
    name = `${base}${index}`;
  }
  return name;
}

export interface CreateOptions {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  name?: string;
  text?: string;
}

export function createWidget(
  spec: WidgetSpec,
  existing: Widget[],
  options: CreateOptions = {},
): Widget {
  const [defaultWidth, defaultHeight] = spec.defaultSize;

  return {
    id: nextId(spec.type),
    type: spec.type,
    name: options.name ?? suggestName(spec, existing),
    text: options.text ?? spec.defaultText,
    tooltip: '',
    layout: {
      ...defaultLayout(),
      position: { x: Math.round(options.x ?? 0), y: Math.round(options.y ?? 0) },
      size: {
        width: Math.round(options.width ?? defaultWidth),
        height: Math.round(options.height ?? defaultHeight),
      },
      padding: defaultBox(),
      margin: defaultBox(),
    },
    appearance: defaultAppearance(),
    behavior: defaultBehavior(),
    props: defaultPropsFor(spec),
    events: {},
    children: [],
  };
}

export function defaultPropsFor(spec: WidgetSpec): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  for (const definition of spec.props) {
    if (definition.default !== null && definition.default !== undefined) {
      // Arrays must be cloned or every new widget would share one instance.
      props[definition.key] = Array.isArray(definition.default)
        ? [...definition.default]
        : definition.default;
    }
  }
  return props;
}

/**
 * Deep-clone a subtree with fresh ids and de-duplicated names.
 * Used by copy/paste and duplicate.
 */
export function cloneWidget(widget: Widget, existing: Widget[], suffix = ' copy'): Widget {
  const taken = new Set([...walk(existing)].map((w) => w.name));

  const clone = (node: Widget, renameRoot: boolean): Widget => {
    let name = node.name;
    if (renameRoot) {
      name = uniqueName(`${node.name}${suffix}`, taken);
      taken.add(name);
    }
    return {
      ...node,
      id: nextId(node.type),
      name,
      layout: {
        ...node.layout,
        position: { ...node.layout.position },
        size: { ...node.layout.size },
        padding: { ...node.layout.padding },
        margin: { ...node.layout.margin },
      },
      appearance: { ...node.appearance, font: { ...node.appearance.font } },
      behavior: { ...node.behavior },
      props: structuredCloneSafe(node.props),
      events: { ...node.events },
      children: node.children.map((child) => clone(child, false)),
    };
  };

  return clone(widget, true);
}

function uniqueName(candidate: string, taken: Set<string>): string {
  if (!taken.has(candidate)) return candidate;
  let index = 2;
  while (taken.has(`${candidate} ${index}`)) index += 1;
  return `${candidate} ${index}`;
}

/** `structuredClone` is not available in every embedded webview. */
function structuredCloneSafe<T>(value: T): T {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Can `parent` accept a child of type `childType`? */
export function canAcceptChild(
  parentSpec: WidgetSpec | undefined,
  childType: string,
  currentChildCount: number,
): boolean {
  if (!parentSpec || !parentSpec.container) return false;
  if (parentSpec.accepts !== null && !parentSpec.accepts.includes(childType)) return false;
  if (parentSpec.maxChildren !== null && currentChildCount >= parentSpec.maxChildren) return false;
  return true;
}
