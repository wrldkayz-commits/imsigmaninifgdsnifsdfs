/**
 * Small shared UI primitives.
 *
 * Deliberately unopinionated and unstyled beyond the design tokens — they exist
 * to stop the same twenty Tailwind classes being retyped in every panel, not to
 * become a component framework.
 */

import {
  forwardRef,
  useId,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react';
import clsx from 'clsx';

// --- layout --------------------------------------------------------------------

export function PanelSection({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="border-b border-edge last:border-b-0">
      <header className="section-title justify-between">
        <span>{title}</span>
        {action}
      </header>
      <div className="space-y-2 px-3 pb-3">{children}</div>
    </section>
  );
}

export function Field({
  label,
  htmlFor,
  children,
  hint,
}: {
  label: string;
  htmlFor?: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <div className="grid grid-cols-[72px_1fr] items-center gap-2">
      <label htmlFor={htmlFor} className="field-label truncate" title={hint ?? label}>
        {label}
      </label>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function FieldRow({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-2">{children}</div>;
}

// --- controls ------------------------------------------------------------------

export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function TextInput({ className, ...props }, ref) {
    return <input ref={ref} className={clsx('input', className)} {...props} />;
  },
);

interface NumberInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  value: number;
  onValueChange: (value: number) => void;
  suffix?: string;
}

/**
 * A number field that commits on every valid keystroke but tolerates transient
 * invalid input (an empty box, a lone minus sign) instead of snapping to 0.
 */
export function NumberField({
  value,
  onValueChange,
  suffix,
  className,
  ...props
}: NumberInputProps) {
  return (
    <div className="relative">
      <input
        type="number"
        value={Number.isFinite(value) ? value : ''}
        onChange={(event) => {
          const parsed = Number.parseFloat(event.target.value);
          if (!Number.isNaN(parsed)) onValueChange(parsed);
          else if (event.target.value === '') onValueChange(0);
        }}
        className={clsx('input', suffix && 'pr-6', className)}
        {...props}
      />
      {suffix && (
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-2xs text-ink-muted">
          {suffix}
        </span>
      )}
    </div>
  );
}

export function SelectField({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={clsx('input cursor-pointer', className)} {...props}>
      {children}
    </select>
  );
}

export function Toggle({
  checked,
  onCheckedChange,
  label,
  disabled,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex items-center gap-2">
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onCheckedChange(!checked)}
        className={clsx(
          'relative h-4 w-7 shrink-0 rounded-full transition-colors disabled:opacity-40',
          checked ? 'bg-accent' : 'bg-ink-muted/40',
        )}
      >
        <span
          className={clsx(
            'absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-all',
            checked ? 'left-3.5' : 'left-0.5',
          )}
        />
      </button>
      {label && (
        <label htmlFor={id} className="cursor-pointer select-none truncate text-xs text-ink">
          {label}
        </label>
      )}
    </div>
  );
}

/**
 * Colour input with a "not set" state — `null` means "inherit from the
 * framework default", which is meaningfully different from an explicit colour
 * and must survive a round-trip through the project file.
 */
export function ColorField({
  value,
  onChange,
  allowClear = true,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
  allowClear?: boolean;
}) {
  return (
    <div className="flex items-center gap-1">
      <div className="relative h-7 w-8 shrink-0 overflow-hidden rounded border border-edge">
        <input
          type="color"
          value={value ?? '#000000'}
          onChange={(event) => onChange(event.target.value)}
          aria-label="Colour"
          className="absolute -inset-2 h-[calc(100%+16px)] w-[calc(100%+16px)] cursor-pointer border-0 bg-transparent p-0"
        />
        {value === null && (
          <div className="pointer-events-none absolute inset-0 bg-surface-raised">
            <div className="absolute left-0 top-1/2 h-px w-full origin-center rotate-[-30deg] bg-danger/70" />
          </div>
        )}
      </div>
      <input
        type="text"
        value={value ?? ''}
        placeholder="default"
        onChange={(event) => onChange(event.target.value || null)}
        className="input font-mono text-2xs"
      />
      {allowClear && value !== null && (
        <button
          type="button"
          onClick={() => onChange(null)}
          title="Reset to the framework default"
          className="shrink-0 rounded p-1 text-ink-muted hover:text-danger"
        >
          ×
        </button>
      )}
    </div>
  );
}

/** Comma/newline separated list editor for `stringList` properties. */
export function StringListField({
  value,
  onChange,
}: {
  value: string[];
  onChange: (value: string[]) => void;
}) {
  return (
    <textarea
      value={value.join('\n')}
      onChange={(event) =>
        onChange(
          event.target.value
            .split('\n')
            // A trailing blank line is a normal part of typing; only drop
            // entries that are blank in the middle of the list.
            .filter((line, index, all) => line.trim() !== '' || index === all.length - 1)
            .filter((line) => line.trim() !== ''),
        )
      }
      rows={Math.min(8, Math.max(3, value.length + 1))}
      placeholder="One item per line"
      className="input h-auto resize-y py-1 leading-5"
    />
  );
}

export function IconButton({
  icon,
  label,
  active,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: ReactNode;
  label: string;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={clsx('toolbar-button px-1.5', active && 'toolbar-button-active', className)}
      {...props}
    >
      {icon}
    </button>
  );
}

export function Divider({ vertical }: { vertical?: boolean }) {
  return vertical ? (
    <div className="mx-1 h-5 w-px shrink-0 bg-edge" />
  ) : (
    <div className="my-1 h-px w-full bg-edge" />
  );
}

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'accent' | 'warn' | 'danger' | 'ok';
}) {
  const tones = {
    neutral: 'bg-ink-muted/15 text-ink-muted',
    accent: 'bg-accent-soft text-accent',
    warn: 'bg-warn/15 text-warn',
    danger: 'bg-danger/15 text-danger',
    ok: 'bg-ok/15 text-ok',
  };
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded px-1.5 py-0.5 text-2xs font-medium',
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex h-full min-h-[120px] flex-col items-center justify-center gap-1 p-6 text-center">
      <p className="text-xs font-medium text-ink">{title}</p>
      {hint && <p className="max-w-[220px] text-2xs text-ink-muted">{hint}</p>}
    </div>
  );
}
