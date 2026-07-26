/**
 * The properties inspector.
 *
 * Shows General / Appearance / Layout / Behavior / Events for the selected
 * widget, plus whatever type-specific properties the catalog declares. With
 * nothing selected it falls back to window and project settings, so the panel
 * is never dead space.
 *
 * Multi-selection edits every selected widget at once; fields whose values
 * differ show a mixed placeholder rather than lying about a single value.
 */

import { useMemo } from 'react';
import type { Widget } from '@/types/project';
import type { EventName } from '@/types/project';
import { getSpec } from '@/store/catalogStore';
import { useProjectStore, useSelectedWidgets } from '@/store/projectStore';
import {
  ColorField,
  Field,
  FieldRow,
  NumberField,
  PanelSection,
  SelectField,
  TextInput,
  Toggle,
} from '@/components/ui/primitives';
import { PropertyEditor, groupProps } from './PropertyEditor';

const ANCHORS = [
  'top-left', 'top', 'top-right',
  'left', 'center', 'right',
  'bottom-left', 'bottom', 'bottom-right',
  'fill',
] as const;

const EVENT_LABELS: Record<EventName, string> = {
  click: 'Click',
  doubleClick: 'Double Click',
  hover: 'Hover',
  keyPress: 'Key Press',
  mouseEnter: 'Mouse Enter',
  mouseLeave: 'Mouse Leave',
  change: 'Change',
  focus: 'Focus',
  blur: 'Blur',
  windowOpen: 'Window Open',
  windowClose: 'Window Close',
};

export function Inspector() {
  const selected = useSelectedWidgets();

  if (selected.length === 0) return <DocumentInspector />;
  if (selected.length > 1) return <MultiInspector widgets={selected} />;
  return <WidgetInspector widget={selected[0]} />;
}

// --- single widget -------------------------------------------------------------

function WidgetInspector({ widget }: { widget: Widget }) {
  const update = useProjectStore((state) => state.updateWidgetById);
  const spec = getSpec(widget.type);

  const set = (
    updater: (current: Widget) => Widget,
    label: string,
    mergeKey?: string,
  ) => update(widget.id, updater, { label, mergeKey: mergeKey && `${mergeKey}:${widget.id}` });

  const setProp = (key: string, value: unknown) =>
    set(
      (current) => ({ ...current, props: { ...current.props, [key]: value } }),
      `Edit ${key}`,
      `prop-${key}`,
    );

  const propGroups = useMemo(() => groupProps(spec?.props ?? []), [spec]);

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <header className="sticky top-0 z-10 border-b border-edge bg-surface/95 px-3 py-2 backdrop-blur">
        <p className="truncate text-xs font-semibold text-ink">{widget.name || widget.type}</p>
        <p className="truncate text-2xs text-ink-muted">
          {spec?.label ?? widget.type} · <span className="font-mono">{widget.id}</span>
        </p>
      </header>

      <PanelSection title="General">
        <Field label="Name" htmlFor="widget-name" hint="Becomes the variable name in generated code">
          <TextInput
            id="widget-name"
            value={widget.name}
            onChange={(event) =>
              set((current) => ({ ...current, name: event.target.value }), 'Rename', 'name')
            }
          />
        </Field>
        <Field label="Text" htmlFor="widget-text">
          <TextInput
            id="widget-text"
            value={widget.text}
            onChange={(event) =>
              set((current) => ({ ...current, text: event.target.value }), 'Edit text', 'text')
            }
          />
        </Field>
        <Field label="Tooltip" htmlFor="widget-tooltip">
          <TextInput
            id="widget-tooltip"
            value={widget.tooltip}
            onChange={(event) =>
              set(
                (current) => ({ ...current, tooltip: event.target.value }),
                'Edit tooltip',
                'tooltip',
              )
            }
          />
        </Field>
      </PanelSection>

      {propGroups.map(([group, definitions]) => (
        <PanelSection key={group} title={group === 'General' ? `${spec?.label ?? ''} Options` : group}>
          {definitions.map((definition) => (
            <PropertyEditor
              key={definition.key}
              definition={definition}
              value={widget.props[definition.key]}
              onChange={(value) => setProp(definition.key, value)}
            />
          ))}
        </PanelSection>
      ))}

      <PanelSection title="Layout">
        <FieldRow>
          <Field label="X" htmlFor="layout-x">
            <NumberField
              id="layout-x"
              value={widget.layout.position.x}
              onValueChange={(x) =>
                set(
                  (current) => ({
                    ...current,
                    layout: {
                      ...current.layout,
                      position: { ...current.layout.position, x },
                    },
                  }),
                  'Move',
                  'position',
                )
              }
            />
          </Field>
          <Field label="Y" htmlFor="layout-y">
            <NumberField
              id="layout-y"
              value={widget.layout.position.y}
              onValueChange={(y) =>
                set(
                  (current) => ({
                    ...current,
                    layout: {
                      ...current.layout,
                      position: { ...current.layout.position, y },
                    },
                  }),
                  'Move',
                  'position',
                )
              }
            />
          </Field>
        </FieldRow>
        <FieldRow>
          <Field label="Width" htmlFor="layout-w">
            <NumberField
              id="layout-w"
              min={1}
              value={widget.layout.size.width}
              onValueChange={(width) =>
                set(
                  (current) => ({
                    ...current,
                    layout: { ...current.layout, size: { ...current.layout.size, width } },
                  }),
                  'Resize',
                  'size',
                )
              }
            />
          </Field>
          <Field label="Height" htmlFor="layout-h">
            <NumberField
              id="layout-h"
              min={1}
              value={widget.layout.size.height}
              onValueChange={(height) =>
                set(
                  (current) => ({
                    ...current,
                    layout: { ...current.layout, size: { ...current.layout.size, height } },
                  }),
                  'Resize',
                  'size',
                )
              }
            />
          </Field>
        </FieldRow>
        <Field label="Anchor" htmlFor="layout-anchor" hint="How the widget reacts when its parent resizes">
          <SelectField
            id="layout-anchor"
            value={widget.layout.anchor}
            onChange={(event) =>
              set(
                (current) => ({
                  ...current,
                  layout: { ...current.layout, anchor: event.target.value as Widget['layout']['anchor'] },
                }),
                'Set anchor',
              )
            }
          >
            {ANCHORS.map((anchor) => (
              <option key={anchor} value={anchor}>
                {anchor}
              </option>
            ))}
          </SelectField>
        </Field>
        <BoxEditor
          label="Padding"
          value={widget.layout.padding}
          onChange={(padding) =>
            set(
              (current) => ({ ...current, layout: { ...current.layout, padding } }),
              'Edit padding',
              'padding',
            )
          }
        />
        <BoxEditor
          label="Margin"
          value={widget.layout.margin}
          onChange={(margin) =>
            set(
              (current) => ({ ...current, layout: { ...current.layout, margin } }),
              'Edit margin',
              'margin',
            )
          }
        />
      </PanelSection>

      <PanelSection title="Appearance">
        <Field label="Font" htmlFor="font-family">
          <TextInput
            id="font-family"
            value={widget.appearance.font.family}
            onChange={(event) =>
              set(
                (current) => ({
                  ...current,
                  appearance: {
                    ...current.appearance,
                    font: { ...current.appearance.font, family: event.target.value },
                  },
                }),
                'Set font',
                'font',
              )
            }
          />
        </Field>
        <FieldRow>
          <Field label="Size" htmlFor="font-size">
            <NumberField
              id="font-size"
              min={6}
              max={96}
              value={widget.appearance.font.size}
              onValueChange={(size) =>
                set(
                  (current) => ({
                    ...current,
                    appearance: {
                      ...current.appearance,
                      font: { ...current.appearance.font, size },
                    },
                  }),
                  'Set font size',
                  'font-size',
                )
              }
            />
          </Field>
          <Field label="Weight" htmlFor="font-weight">
            <SelectField
              id="font-weight"
              value={widget.appearance.font.weight}
              onChange={(event) =>
                set(
                  (current) => ({
                    ...current,
                    appearance: {
                      ...current.appearance,
                      font: {
                        ...current.appearance.font,
                        weight: event.target.value as 'normal' | 'bold',
                      },
                    },
                  }),
                  'Set font weight',
                )
              }
            >
              <option value="normal">normal</option>
              <option value="bold">bold</option>
            </SelectField>
          </Field>
        </FieldRow>
        <div className="flex gap-4 pl-[80px]">
          <Toggle
            checked={widget.appearance.font.style === 'italic'}
            label="Italic"
            onCheckedChange={(italic) =>
              set(
                (current) => ({
                  ...current,
                  appearance: {
                    ...current.appearance,
                    font: { ...current.appearance.font, style: italic ? 'italic' : 'normal' },
                  },
                }),
                'Toggle italic',
              )
            }
          />
          <Toggle
            checked={widget.appearance.font.underline}
            label="Underline"
            onCheckedChange={(underline) =>
              set(
                (current) => ({
                  ...current,
                  appearance: {
                    ...current.appearance,
                    font: { ...current.appearance.font, underline },
                  },
                }),
                'Toggle underline',
              )
            }
          />
        </div>

        <Field label="Colour">
          <ColorField
            value={widget.appearance.color}
            onChange={(color) =>
              set(
                (current) => ({ ...current, appearance: { ...current.appearance, color } }),
                'Set colour',
                'color',
              )
            }
          />
        </Field>
        <Field label="Background">
          <ColorField
            value={widget.appearance.background}
            onChange={(background) =>
              set(
                (current) => ({ ...current, appearance: { ...current.appearance, background } }),
                'Set background',
                'background',
              )
            }
          />
        </Field>
        <Field label="Border">
          <ColorField
            value={widget.appearance.borderColor}
            onChange={(borderColor) =>
              set(
                (current) => ({ ...current, appearance: { ...current.appearance, borderColor } }),
                'Set border colour',
                'border-color',
              )
            }
          />
        </Field>
        <FieldRow>
          <Field label="Width" htmlFor="border-width">
            <NumberField
              id="border-width"
              min={0}
              max={20}
              value={widget.appearance.borderWidth}
              onValueChange={(borderWidth) =>
                set(
                  (current) => ({
                    ...current,
                    appearance: { ...current.appearance, borderWidth },
                  }),
                  'Set border width',
                  'border-width',
                )
              }
            />
          </Field>
          <Field label="Radius" htmlFor="radius">
            <NumberField
              id="radius"
              min={0}
              max={999}
              value={widget.appearance.radius}
              onValueChange={(radius) =>
                set(
                  (current) => ({ ...current, appearance: { ...current.appearance, radius } }),
                  'Set radius',
                  'radius',
                )
              }
            />
          </Field>
        </FieldRow>
        <Field label="Opacity" htmlFor="opacity">
          <input
            id="opacity"
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={widget.appearance.opacity}
            onChange={(event) =>
              set(
                (current) => ({
                  ...current,
                  appearance: {
                    ...current.appearance,
                    opacity: Number.parseFloat(event.target.value),
                  },
                }),
                'Set opacity',
                'opacity',
              )
            }
            className="w-full accent-accent"
          />
        </Field>
      </PanelSection>

      <PanelSection title="Behavior">
        <Toggle
          checked={widget.behavior.visible}
          label="Visible"
          onCheckedChange={(visible) =>
            set(
              (current) => ({ ...current, behavior: { ...current.behavior, visible } }),
              'Toggle visibility',
            )
          }
        />
        <Toggle
          checked={widget.behavior.enabled}
          label="Enabled"
          onCheckedChange={(enabled) =>
            set(
              (current) => ({ ...current, behavior: { ...current.behavior, enabled } }),
              'Toggle enabled',
            )
          }
        />
        <Toggle
          checked={widget.behavior.focusable}
          label="Can receive focus"
          onCheckedChange={(focusable) =>
            set(
              (current) => ({ ...current, behavior: { ...current.behavior, focusable } }),
              'Toggle focusable',
            )
          }
        />
        <Toggle
          checked={widget.behavior.locked}
          label="Locked"
          onCheckedChange={(locked) =>
            set(
              (current) => ({ ...current, behavior: { ...current.behavior, locked } }),
              'Toggle lock',
            )
          }
        />
        <Field label="Tab order" htmlFor="tab-order">
          <NumberField
            id="tab-order"
            min={0}
            value={widget.behavior.tabOrder ?? 0}
            onValueChange={(tabOrder) =>
              set(
                (current) => ({
                  ...current,
                  behavior: { ...current.behavior, tabOrder: tabOrder || null },
                }),
                'Set tab order',
                'tab-order',
              )
            }
          />
        </Field>
      </PanelSection>

      <PanelSection title="Events">
        <p className="pb-1 text-2xs leading-relaxed text-ink-muted">
          Name a handler and the generator emits a stub for it in the exported code.
        </p>
        {(spec?.events ?? []).length === 0 && (
          <p className="text-2xs text-ink-muted">This widget raises no events.</p>
        )}
        {(spec?.events ?? []).map((event) => (
          <Field key={event} label={EVENT_LABELS[event] ?? event} htmlFor={`event-${event}`}>
            <TextInput
              id={`event-${event}`}
              value={widget.events[event] ?? ''}
              placeholder={`on_${widget.name.toLowerCase() || 'widget'}_${event.toLowerCase()}`}
              onChange={(current) =>
                set(
                  (node) => ({
                    ...node,
                    events: { ...node.events, [event]: current.target.value },
                  }),
                  'Set handler',
                  `event-${event}`,
                )
              }
              className="font-mono"
            />
          </Field>
        ))}
      </PanelSection>
    </div>
  );
}

// --- multi-selection -----------------------------------------------------------

function MultiInspector({ widgets }: { widgets: Widget[] }) {
  const updateSelected = useProjectStore((state) => state.updateSelected);
  const align = useProjectStore((state) => state.align);
  const distribute = useProjectStore((state) => state.distribute);

  const shared = <T,>(read: (widget: Widget) => T): T | null => {
    const first = read(widgets[0]);
    return widgets.every((widget) => read(widget) === first) ? first : null;
  };

  const sharedWidth = shared((widget) => widget.layout.size.width);
  const sharedHeight = shared((widget) => widget.layout.size.height);

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <header className="sticky top-0 z-10 border-b border-edge bg-surface/95 px-3 py-2 backdrop-blur">
        <p className="text-xs font-semibold text-ink">{widgets.length} widgets selected</p>
        <p className="truncate text-2xs text-ink-muted">
          {[...new Set(widgets.map((widget) => widget.type))].join(', ')}
        </p>
      </header>

      <PanelSection title="Align">
        <div className="grid grid-cols-3 gap-1">
          {(
            [
              ['left', 'Left'],
              ['centerX', 'Centre'],
              ['right', 'Right'],
              ['top', 'Top'],
              ['centerY', 'Middle'],
              ['bottom', 'Bottom'],
            ] as const
          ).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              onClick={() => align(mode)}
              className="rounded border border-edge px-2 py-1 text-2xs hover:border-accent hover:text-accent"
            >
              {label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-1 pt-1">
          <button
            type="button"
            disabled={widgets.length < 3}
            onClick={() => distribute('horizontal')}
            className="rounded border border-edge px-2 py-1 text-2xs hover:border-accent hover:text-accent disabled:opacity-40"
          >
            Distribute H
          </button>
          <button
            type="button"
            disabled={widgets.length < 3}
            onClick={() => distribute('vertical')}
            className="rounded border border-edge px-2 py-1 text-2xs hover:border-accent hover:text-accent disabled:opacity-40"
          >
            Distribute V
          </button>
        </div>
      </PanelSection>

      <PanelSection title="Size">
        <FieldRow>
          <Field label="Width" htmlFor="multi-w">
            <NumberField
              id="multi-w"
              min={1}
              value={sharedWidth ?? 0}
              placeholder={sharedWidth === null ? 'Mixed' : undefined}
              onValueChange={(width) =>
                updateSelected(
                  (widget) => ({
                    ...widget,
                    layout: { ...widget.layout, size: { ...widget.layout.size, width } },
                  }),
                  { label: 'Resize', mergeKey: 'multi-width' },
                )
              }
            />
          </Field>
          <Field label="Height" htmlFor="multi-h">
            <NumberField
              id="multi-h"
              min={1}
              value={sharedHeight ?? 0}
              placeholder={sharedHeight === null ? 'Mixed' : undefined}
              onValueChange={(height) =>
                updateSelected(
                  (widget) => ({
                    ...widget,
                    layout: { ...widget.layout, size: { ...widget.layout.size, height } },
                  }),
                  { label: 'Resize', mergeKey: 'multi-height' },
                )
              }
            />
          </Field>
        </FieldRow>
      </PanelSection>

      <PanelSection title="Appearance">
        <Field label="Colour">
          <ColorField
            value={shared((widget) => widget.appearance.color)}
            onChange={(color) =>
              updateSelected(
                (widget) => ({ ...widget, appearance: { ...widget.appearance, color } }),
                { label: 'Set colour', mergeKey: 'multi-color' },
              )
            }
          />
        </Field>
        <Field label="Background">
          <ColorField
            value={shared((widget) => widget.appearance.background)}
            onChange={(background) =>
              updateSelected(
                (widget) => ({ ...widget, appearance: { ...widget.appearance, background } }),
                { label: 'Set background', mergeKey: 'multi-background' },
              )
            }
          />
        </Field>
        <Field label="Radius" htmlFor="multi-radius">
          <NumberField
            id="multi-radius"
            min={0}
            value={shared((widget) => widget.appearance.radius) ?? 0}
            onValueChange={(radius) =>
              updateSelected(
                (widget) => ({ ...widget, appearance: { ...widget.appearance, radius } }),
                { label: 'Set radius', mergeKey: 'multi-radius' },
              )
            }
          />
        </Field>
      </PanelSection>

      <PanelSection title="Behavior">
        <Toggle
          checked={shared((widget) => widget.behavior.visible) ?? false}
          label="Visible"
          onCheckedChange={(visible) =>
            updateSelected(
              (widget) => ({ ...widget, behavior: { ...widget.behavior, visible } }),
              { label: 'Toggle visibility' },
            )
          }
        />
        <Toggle
          checked={shared((widget) => widget.behavior.enabled) ?? false}
          label="Enabled"
          onCheckedChange={(enabled) =>
            updateSelected(
              (widget) => ({ ...widget, behavior: { ...widget.behavior, enabled } }),
              { label: 'Toggle enabled' },
            )
          }
        />
        <Toggle
          checked={shared((widget) => widget.behavior.locked) ?? false}
          label="Locked"
          onCheckedChange={(locked) =>
            updateSelected(
              (widget) => ({ ...widget, behavior: { ...widget.behavior, locked } }),
              { label: 'Toggle lock' },
            )
          }
        />
      </PanelSection>
    </div>
  );
}

// --- nothing selected ----------------------------------------------------------

function DocumentInspector() {
  const project = useProjectStore((state) => state.project);
  const setWindow = useProjectStore((state) => state.setWindow);
  const setProjectMeta = useProjectStore((state) => state.setProjectMeta);

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <header className="sticky top-0 z-10 border-b border-edge bg-surface/95 px-3 py-2 backdrop-blur">
        <p className="text-xs font-semibold text-ink">Project</p>
        <p className="text-2xs text-ink-muted">Select a widget to edit its properties</p>
      </header>

      <PanelSection title="Project">
        <Field label="Name" htmlFor="project-name">
          <TextInput
            id="project-name"
            value={project.project.name}
            onChange={(event) => setProjectMeta({ name: event.target.value })}
          />
        </Field>
        <Field label="Author" htmlFor="project-author">
          <TextInput
            id="project-author"
            value={project.project.author}
            onChange={(event) => setProjectMeta({ author: event.target.value })}
          />
        </Field>
        <div className="space-y-1">
          <label htmlFor="project-description" className="field-label">
            Description
          </label>
          <textarea
            id="project-description"
            value={project.project.description}
            onChange={(event) => setProjectMeta({ description: event.target.value })}
            rows={3}
            className="input h-auto resize-y py-1 leading-5"
          />
        </div>
      </PanelSection>

      <PanelSection title="Window">
        <Field label="Title" htmlFor="window-title">
          <TextInput
            id="window-title"
            value={project.window.title}
            onChange={(event) => setWindow({ title: event.target.value })}
          />
        </Field>
        <FieldRow>
          <Field label="Width" htmlFor="window-width">
            <NumberField
              id="window-width"
              min={120}
              value={project.window.width}
              onValueChange={(width) => setWindow({ width: Math.round(width) })}
            />
          </Field>
          <Field label="Height" htmlFor="window-height">
            <NumberField
              id="window-height"
              min={120}
              value={project.window.height}
              onValueChange={(height) => setWindow({ height: Math.round(height) })}
            />
          </Field>
        </FieldRow>
        <Field label="Background">
          <ColorField
            value={project.window.background}
            onChange={(background) => setWindow({ background: background ?? '#ffffff' })}
            allowClear={false}
          />
        </Field>
        <Toggle
          checked={project.window.resizable}
          label="Resizable"
          onCheckedChange={(resizable) => setWindow({ resizable })}
        />
      </PanelSection>
    </div>
  );
}

// --- shared --------------------------------------------------------------------

function BoxEditor({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Widget['layout']['padding'];
  onChange: (value: Widget['layout']['padding']) => void;
}) {
  return (
    <div className="space-y-1">
      <span className="field-label">{label}</span>
      <div className="grid grid-cols-4 gap-1">
        {(['top', 'right', 'bottom', 'left'] as const).map((side) => (
          <NumberField
            key={side}
            aria-label={`${label} ${side}`}
            title={side}
            min={0}
            value={value[side]}
            onValueChange={(next) => onChange({ ...value, [side]: next })}
          />
        ))}
      </div>
    </div>
  );
}
