/**
 * Renders one catalog-declared property.
 *
 * The inspector never hard-codes a widget's properties: it walks the `PropDef`s
 * the backend supplied and picks an editor by `type`. A plugin that introduces
 * a new widget with new properties gets a working inspector for free.
 */

import type { PropDef } from '@/types/catalog';
import {
  ColorField,
  Field,
  NumberField,
  SelectField,
  StringListField,
  TextInput,
  Toggle,
} from '@/components/ui/primitives';

interface PropertyEditorProps {
  definition: PropDef;
  value: unknown;
  onChange: (value: unknown) => void;
}

export function PropertyEditor({ definition, value, onChange }: PropertyEditorProps) {
  const id = `prop-${definition.key}`;

  switch (definition.type) {
    case 'boolean':
      return (
        <div className="grid grid-cols-[72px_1fr] items-center gap-2">
          <span className="field-label truncate" title={definition.help || definition.label}>
            {definition.label}
          </span>
          <Toggle
            checked={typeof value === 'boolean' ? value : Boolean(definition.default)}
            onCheckedChange={onChange}
            label={definition.label}
          />
        </div>
      );

    case 'number':
      return (
        <Field label={definition.label} htmlFor={id} hint={definition.help}>
          <NumberField
            id={id}
            value={typeof value === 'number' ? value : Number(definition.default ?? 0)}
            onValueChange={onChange}
            min={definition.min ?? undefined}
            max={definition.max ?? undefined}
            step={definition.step ?? undefined}
          />
        </Field>
      );

    case 'select':
      return (
        <Field label={definition.label} htmlFor={id} hint={definition.help}>
          <SelectField
            id={id}
            value={String(value ?? definition.default ?? '')}
            onChange={(event) => onChange(event.target.value)}
          >
            {definition.options.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </SelectField>
        </Field>
      );

    case 'color':
      return (
        <Field label={definition.label} hint={definition.help}>
          <ColorField
            value={typeof value === 'string' ? value : String(definition.default ?? '#000000')}
            onChange={(next) => onChange(next ?? definition.default)}
            allowClear={false}
          />
        </Field>
      );

    case 'stringList':
      return (
        <div className="space-y-1">
          <span className="field-label">{definition.label}</span>
          <StringListField
            value={Array.isArray(value) ? value.map(String) : []}
            onChange={onChange}
          />
        </div>
      );

    case 'text':
      return (
        <div className="space-y-1">
          <label htmlFor={id} className="field-label">
            {definition.label}
          </label>
          <textarea
            id={id}
            value={typeof value === 'string' ? value : ''}
            onChange={(event) => onChange(event.target.value)}
            rows={4}
            className="input h-auto resize-y py-1 leading-5"
          />
        </div>
      );

    case 'image':
      return (
        <Field label={definition.label} htmlFor={id} hint={definition.help}>
          <TextInput
            id={id}
            value={typeof value === 'string' ? value : ''}
            onChange={(event) => onChange(event.target.value)}
            placeholder="path or data URI"
          />
        </Field>
      );

    case 'string':
    case 'font':
    default:
      return (
        <Field label={definition.label} htmlFor={id} hint={definition.help}>
          <TextInput
            id={id}
            value={typeof value === 'string' ? value : String(value ?? '')}
            onChange={(event) => onChange(event.target.value)}
          />
        </Field>
      );
  }
}

/** Group `PropDef`s by their declared `group`, preserving declaration order. */
export function groupProps(definitions: PropDef[]): [string, PropDef[]][] {
  const groups = new Map<string, PropDef[]>();
  for (const definition of definitions) {
    const bucket = groups.get(definition.group);
    if (bucket) bucket.push(definition);
    else groups.set(definition.group, [definition]);
  }
  return [...groups.entries()];
}
