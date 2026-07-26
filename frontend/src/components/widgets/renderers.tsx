/**
 * Visual approximations of each widget type for the canvas and live preview.
 *
 * These are *representations*, not implementations: the goal is that what the
 * designer sees matches the exported code's layout, spacing and colour closely
 * enough to design against. Real behaviour belongs to the generated app.
 *
 * Renderers live in a lookup table rather than a switch so a widget type can be
 * registered without editing a component, and anything missing falls through to
 * `FallbackRenderer` — which is what lets the catalog grow past a hundred types
 * without this file becoming a liability.
 */

import type { CSSProperties, ReactNode } from 'react';
import {
  Calendar,
  ChevronDown,
  Circle,
  Image as ImageIcon,
  Loader2,
  Star,
} from 'lucide-react';
import type { Widget } from '@/types/project';

export interface RenderContext {
  widget: Widget;
  /** Children are rendered by the canvas, which owns positioning. */
  children?: ReactNode;
  /** True in live-preview mode; renderers may show a more finished state. */
  preview: boolean;
}

export type WidgetRenderer = (context: RenderContext) => ReactNode;

// --- shared helpers ------------------------------------------------------------

const textStyle = (widget: Widget): CSSProperties => ({
  fontFamily: widget.appearance.font.family,
  fontSize: widget.appearance.font.size,
  fontWeight: widget.appearance.font.weight,
  fontStyle: widget.appearance.font.style,
  textDecoration: widget.appearance.font.underline ? 'underline' : undefined,
  color: widget.appearance.color ?? undefined,
});

const surfaceStyle = (widget: Widget, fallbackBackground?: string): CSSProperties => ({
  background: widget.appearance.background ?? fallbackBackground,
  borderRadius: widget.appearance.radius || undefined,
  borderWidth: widget.appearance.borderWidth || undefined,
  borderColor: widget.appearance.borderColor ?? undefined,
  borderStyle: widget.appearance.borderWidth ? 'solid' : undefined,
});

const padding = (widget: Widget): CSSProperties => ({
  paddingTop: widget.layout.padding.top || undefined,
  paddingRight: widget.layout.padding.right || undefined,
  paddingBottom: widget.layout.padding.bottom || undefined,
  paddingLeft: widget.layout.padding.left || undefined,
});

const asString = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : fallback;

const asNumber = (value: unknown, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const asBoolean = (value: unknown, fallback = false): boolean =>
  typeof value === 'boolean' ? value : fallback;

const asList = (value: unknown): string[] =>
  Array.isArray(value) ? value.map((item) => String(item)) : [];

const alignment = (value: unknown): CSSProperties['justifyContent'] =>
  ({ left: 'flex-start', center: 'center', right: 'flex-end' })[asString(value, 'left')] ??
  'flex-start';

/** Neutral chrome used by controls that have no explicit colours set. */
const CONTROL_BORDER = '1px solid rgba(127,127,127,0.42)';
const CONTROL_BACKGROUND = 'rgba(255,255,255,0.85)';

// --- containers ----------------------------------------------------------------

const Frame: WidgetRenderer = ({ widget, children }) => (
  <div
    className="relative h-full w-full"
    style={{
      ...surfaceStyle(widget, 'rgba(127,127,127,0.06)'),
      ...padding(widget),
      border: widget.appearance.borderWidth ? undefined : '1px dashed rgba(127,127,127,0.35)',
    }}
  >
    {children}
  </div>
);

const Panel: WidgetRenderer = ({ widget, children }) => (
  <div
    className="relative h-full w-full"
    style={{ ...surfaceStyle(widget, 'rgba(127,127,127,0.08)'), ...padding(widget) }}
  >
    {children}
  </div>
);

const Group: WidgetRenderer = ({ widget, children }) => (
  <div
    className="relative h-full w-full"
    style={{
      ...surfaceStyle(widget),
      border: '1px solid rgba(127,127,127,0.4)',
      borderRadius: widget.appearance.radius || 4,
      ...padding(widget),
    }}
  >
    {widget.text && (
      <span
        className="absolute -top-2 left-3 px-1 text-[11px]"
        style={{
          ...textStyle(widget),
          background: widget.appearance.background ?? 'rgb(var(--surface))',
        }}
      >
        {widget.text}
      </span>
    )}
    {children}
  </div>
);

const Tabs: WidgetRenderer = ({ widget, children }) => {
  const items = asList(widget.props.items);
  const titles = items.length
    ? items
    : widget.children.map((child, index) => child.text || `Tab ${index + 1}`);

  return (
    <div className="relative flex h-full w-full flex-col" style={surfaceStyle(widget)}>
      <div className="flex shrink-0 gap-0.5 border-b" style={{ borderColor: 'rgba(127,127,127,0.4)' }}>
        {(titles.length ? titles : ['Tab 1']).map((title, index) => (
          <div
            key={`${title}-${index}`}
            className="border-b-2 px-3 py-1 text-[11px]"
            style={{
              ...textStyle(widget),
              borderColor: index === 0 ? 'rgb(var(--accent))' : 'transparent',
              opacity: index === 0 ? 1 : 0.6,
            }}
          >
            {title}
          </div>
        ))}
      </div>
      <div className="relative flex-1">{children}</div>
    </div>
  );
};

const ScrollArea: WidgetRenderer = ({ widget, children }) => (
  <div
    className="relative h-full w-full overflow-hidden"
    style={{ ...surfaceStyle(widget, 'rgba(127,127,127,0.05)'), border: CONTROL_BORDER }}
  >
    {children}
    <div className="absolute right-0.5 top-1 bottom-1 w-1.5 rounded-full bg-current opacity-25" />
  </div>
);

const Splitter: WidgetRenderer = ({ widget, children }) => {
  const vertical = asString(widget.props.orientation, 'horizontal') === 'vertical';
  return (
    <div className="relative h-full w-full" style={surfaceStyle(widget)}>
      {children}
      <div
        className="absolute bg-current opacity-25"
        style={
          vertical
            ? { left: 0, right: 0, top: '50%', height: 3 }
            : { top: 0, bottom: 0, left: '50%', width: 3 }
        }
      />
    </div>
  );
};

// --- inputs --------------------------------------------------------------------

const TextBox: WidgetRenderer = ({ widget }) => {
  const value = asString(widget.props.value);
  const placeholder = asString(widget.props.placeholder);
  return (
    <div
      className="flex h-full w-full items-center overflow-hidden px-2"
      style={{
        ...textStyle(widget),
        background: widget.appearance.background ?? CONTROL_BACKGROUND,
        border: CONTROL_BORDER,
        borderRadius: widget.appearance.radius || 3,
      }}
    >
      <span className="truncate" style={{ opacity: value ? 1 : 0.45 }}>
        {value || placeholder}
      </span>
    </div>
  );
};

const PasswordBox: WidgetRenderer = ({ widget }) => {
  const mask = asString(widget.props.maskChar, '•');
  return (
    <div
      className="flex h-full w-full items-center overflow-hidden px-2"
      style={{
        ...textStyle(widget),
        background: widget.appearance.background ?? CONTROL_BACKGROUND,
        border: CONTROL_BORDER,
        borderRadius: widget.appearance.radius || 3,
      }}
    >
      <span className="tracking-[0.2em]">{mask.repeat(8)}</span>
    </div>
  );
};

const MultilineText: WidgetRenderer = ({ widget }) => {
  const value = asString(widget.props.value) || asString(widget.props.placeholder);
  return (
    <div
      className="h-full w-full overflow-hidden whitespace-pre-wrap p-2"
      style={{
        ...textStyle(widget),
        background: widget.appearance.background ?? CONTROL_BACKGROUND,
        border: CONTROL_BORDER,
        borderRadius: widget.appearance.radius || 3,
        opacity: asString(widget.props.value) ? 1 : 0.5,
      }}
    >
      {value}
    </div>
  );
};

const NumberInput: WidgetRenderer = ({ widget }) => (
  <div
    className="flex h-full w-full items-center justify-between overflow-hidden px-2"
    style={{
      ...textStyle(widget),
      background: widget.appearance.background ?? CONTROL_BACKGROUND,
      border: CONTROL_BORDER,
      borderRadius: widget.appearance.radius || 3,
    }}
  >
    <span>{asNumber(widget.props.value)}</span>
    <div className="flex flex-col text-[7px] leading-none opacity-60">
      <span>▲</span>
      <span>▼</span>
    </div>
  </div>
);

const Slider: WidgetRenderer = ({ widget }) => {
  const min = asNumber(widget.props.min, 0);
  const max = asNumber(widget.props.max, 100);
  const value = asNumber(widget.props.value, 50);
  const ratio = max > min ? (value - min) / (max - min) : 0;
  const vertical = asString(widget.props.orientation, 'horizontal') === 'vertical';
  const accent = widget.appearance.color ?? 'rgb(var(--accent))';

  return (
    <div className="relative flex h-full w-full items-center justify-center">
      <div
        className="absolute rounded-full bg-current opacity-25"
        style={vertical ? { width: 4, top: 0, bottom: 0 } : { height: 4, left: 0, right: 0 }}
      />
      <div
        className="absolute rounded-full"
        style={
          vertical
            ? { width: 4, bottom: 0, height: `${ratio * 100}%`, background: accent }
            : { height: 4, left: 0, width: `${ratio * 100}%`, background: accent }
        }
      />
      <div
        className="absolute h-3.5 w-3.5 rounded-full border-2 bg-white shadow"
        style={
          vertical
            ? { bottom: `calc(${ratio * 100}% - 7px)`, borderColor: accent }
            : { left: `calc(${ratio * 100}% - 7px)`, borderColor: accent }
        }
      />
    </div>
  );
};

const Checkbox: WidgetRenderer = ({ widget }) => {
  const checked = asBoolean(widget.props.checked);
  const accent = widget.appearance.color ?? 'rgb(var(--accent))';
  return (
    <div className="flex h-full w-full items-center gap-2" style={textStyle(widget)}>
      <span
        className="grid h-3.5 w-3.5 shrink-0 place-items-center rounded-[3px] border text-[9px] font-bold text-white"
        style={{
          borderColor: checked ? accent : 'rgba(127,127,127,0.6)',
          background: checked ? accent : 'transparent',
        }}
      >
        {checked ? '✓' : ''}
      </span>
      <span className="truncate">{widget.text}</span>
    </div>
  );
};

const RadioButton: WidgetRenderer = ({ widget }) => {
  const checked = asBoolean(widget.props.checked);
  const accent = widget.appearance.color ?? 'rgb(var(--accent))';
  return (
    <div className="flex h-full w-full items-center gap-2" style={textStyle(widget)}>
      <span
        className="grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full border"
        style={{ borderColor: checked ? accent : 'rgba(127,127,127,0.6)' }}
      >
        {checked && <span className="h-1.5 w-1.5 rounded-full" style={{ background: accent }} />}
      </span>
      <span className="truncate">{widget.text}</span>
    </div>
  );
};

const ComboBox: WidgetRenderer = ({ widget }) => {
  const items = asList(widget.props.items);
  const index = asNumber(widget.props.selected, 0);
  return (
    <div
      className="flex h-full w-full items-center justify-between gap-1 overflow-hidden px-2"
      style={{
        ...textStyle(widget),
        background: widget.appearance.background ?? CONTROL_BACKGROUND,
        border: CONTROL_BORDER,
        borderRadius: widget.appearance.radius || 3,
      }}
    >
      <span className="truncate">{items[index] ?? items[0] ?? 'Select…'}</span>
      <ChevronDown size={12} className="shrink-0 opacity-60" />
    </div>
  );
};

const ColorPicker: WidgetRenderer = ({ widget }) => {
  const color = asString(widget.props.value, '#3b82f6');
  return (
    <div
      className="flex h-full w-full items-center gap-2 overflow-hidden px-2"
      style={{
        ...textStyle(widget),
        background: widget.appearance.background ?? CONTROL_BACKGROUND,
        border: CONTROL_BORDER,
        borderRadius: widget.appearance.radius || 3,
      }}
    >
      <span
        className="h-4 w-4 shrink-0 rounded-sm border border-black/20"
        style={{ background: color }}
      />
      <span className="truncate font-mono text-[10px]">{color}</span>
    </div>
  );
};

const DatePicker: WidgetRenderer = ({ widget }) => (
  <div
    className="flex h-full w-full items-center justify-between gap-1 overflow-hidden px-2"
    style={{
      ...textStyle(widget),
      background: widget.appearance.background ?? CONTROL_BACKGROUND,
      border: CONTROL_BORDER,
      borderRadius: widget.appearance.radius || 3,
    }}
  >
    <span className="truncate">
      {asString(widget.props.value) || asString(widget.props.format, 'yyyy-MM-dd')}
    </span>
    <Calendar size={12} className="shrink-0 opacity-60" />
  </div>
);

// --- buttons -------------------------------------------------------------------

const VARIANT_STYLE: Record<string, CSSProperties> = {
  primary: { background: 'rgb(var(--accent))', color: '#fff' },
  secondary: { background: 'rgba(127,127,127,0.22)' },
  outline: { border: '1px solid currentColor', background: 'transparent' },
  ghost: { background: 'transparent' },
  danger: { background: 'rgb(var(--danger))', color: '#fff' },
};

const Button: WidgetRenderer = ({ widget }) => {
  const variant = asString(widget.props.variant, 'secondary');
  const base = VARIANT_STYLE[variant] ?? VARIANT_STYLE.secondary;

  return (
    <div
      className="flex h-full w-full items-center justify-center gap-1.5 overflow-hidden px-2 text-center"
      style={{
        ...base,
        ...textStyle(widget),
        background: widget.appearance.background ?? base.background,
        color: widget.appearance.color ?? base.color,
        borderRadius: widget.appearance.radius || 4,
        borderWidth: widget.appearance.borderWidth || (variant === 'outline' ? 1 : undefined),
        borderColor: widget.appearance.borderColor ?? undefined,
        borderStyle: widget.appearance.borderWidth || variant === 'outline' ? 'solid' : undefined,
      }}
    >
      <span className="truncate">{widget.text}</span>
    </div>
  );
};

const ToggleButton: WidgetRenderer = ({ widget }) => {
  const checked = asBoolean(widget.props.checked);
  const accent = widget.appearance.background ?? 'rgb(var(--accent))';
  return (
    <div className="flex h-full w-full items-center gap-2" style={textStyle(widget)}>
      <span
        className="relative h-4 w-7 shrink-0 rounded-full transition-colors"
        style={{ background: checked ? accent : 'rgba(127,127,127,0.4)' }}
      >
        <span
          className="absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-all"
          style={{ left: checked ? 14 : 2 }}
        />
      </span>
      <span className="truncate">{widget.text}</span>
    </div>
  );
};

const IconButton: WidgetRenderer = ({ widget }) => (
  <div
    className="grid h-full w-full place-items-center overflow-hidden"
    style={{
      ...textStyle(widget),
      background: widget.appearance.background ?? (asBoolean(widget.props.flat, true)
        ? 'transparent'
        : 'rgba(127,127,127,0.22)'),
      borderRadius: widget.appearance.radius || 4,
    }}
  >
    {widget.text ? (
      <span className="truncate text-[11px]">{widget.text}</span>
    ) : (
      <Star size={16} className="opacity-70" />
    )}
  </div>
);

// --- display -------------------------------------------------------------------

const Label: WidgetRenderer = ({ widget }) => (
  <div
    className="flex h-full w-full items-center overflow-hidden"
    style={{ ...textStyle(widget), justifyContent: alignment(widget.props.align) }}
  >
    <span className="truncate">{widget.text}</span>
  </div>
);

const ImageWidget: WidgetRenderer = ({ widget }) => {
  const source = asString(widget.props.source);
  const fit = asString(widget.props.fit, 'contain') as CSSProperties['objectFit'];

  if (source) {
    return (
      <img
        src={source}
        alt={widget.name}
        className="h-full w-full"
        style={{ objectFit: fit, borderRadius: widget.appearance.radius || undefined }}
      />
    );
  }

  return (
    <div
      className="grid h-full w-full place-items-center"
      style={{
        background: widget.appearance.background ?? 'rgba(127,127,127,0.15)',
        border: '1px dashed rgba(127,127,127,0.45)',
        borderRadius: widget.appearance.radius || undefined,
      }}
    >
      <ImageIcon size={20} className="opacity-40" />
    </div>
  );
};

const ProgressBar: WidgetRenderer = ({ widget }) => {
  const min = asNumber(widget.props.min, 0);
  const max = asNumber(widget.props.max, 100);
  const ratio = asBoolean(widget.props.indeterminate)
    ? 0.4
    : max > min
      ? (asNumber(widget.props.value, 0) - min) / (max - min)
      : 0;

  return (
    <div
      className="h-full w-full overflow-hidden rounded-full"
      style={{ background: 'rgba(127,127,127,0.25)', borderRadius: widget.appearance.radius || 999 }}
    >
      <div
        className="h-full rounded-full transition-all"
        style={{
          width: `${Math.max(0, Math.min(1, ratio)) * 100}%`,
          background: widget.appearance.color ?? 'rgb(var(--accent))',
        }}
      />
    </div>
  );
};

const Spinner: WidgetRenderer = ({ widget, preview }) => (
  <div className="grid h-full w-full place-items-center">
    <Loader2
      size={Math.min(widget.layout.size.width, widget.layout.size.height) * 0.7}
      className={preview ? 'animate-spin' : ''}
      style={{ color: widget.appearance.color ?? 'rgb(var(--accent))' }}
    />
  </div>
);

const Separator: WidgetRenderer = ({ widget }) => {
  const vertical = asString(widget.props.orientation, 'horizontal') === 'vertical';
  return (
    <div className="grid h-full w-full place-items-center">
      <div
        style={{
          background: widget.appearance.background ?? 'rgba(127,127,127,0.45)',
          width: vertical ? 1 : '100%',
          height: vertical ? '100%' : 1,
        }}
      />
    </div>
  );
};

const Table: WidgetRenderer = ({ widget }) => {
  const columns = asList(widget.props.columns);
  const rows = Math.max(0, asNumber(widget.props.rows, 4));
  const headers = columns.length ? columns : ['Column 1', 'Column 2'];

  return (
    <div
      className="flex h-full w-full flex-col overflow-hidden"
      style={{
        ...textStyle(widget),
        background: widget.appearance.background ?? CONTROL_BACKGROUND,
        border: CONTROL_BORDER,
        borderRadius: widget.appearance.radius || 3,
      }}
    >
      <div
        className="flex shrink-0 border-b text-[10px] font-semibold"
        style={{ borderColor: 'rgba(127,127,127,0.4)', background: 'rgba(127,127,127,0.12)' }}
      >
        {headers.map((header, index) => (
          <div key={`${header}-${index}`} className="flex-1 truncate px-2 py-1">
            {header}
          </div>
        ))}
      </div>
      <div className="flex-1 overflow-hidden">
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <div
            key={rowIndex}
            className="flex border-b text-[10px]"
            style={{
              borderColor: 'rgba(127,127,127,0.2)',
              background: rowIndex % 2 ? 'rgba(127,127,127,0.06)' : undefined,
            }}
          >
            {headers.map((_column, columnIndex) => (
              <div key={columnIndex} className="flex-1 truncate px-2 py-1 opacity-45">
                —
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

const TreeView: WidgetRenderer = ({ widget }) => {
  const items = asList(widget.props.items);
  const shown = items.length ? items : ['Root', '  Child'];

  return (
    <div
      className="h-full w-full overflow-hidden py-1"
      style={{
        ...textStyle(widget),
        background: widget.appearance.background ?? CONTROL_BACKGROUND,
        border: CONTROL_BORDER,
        borderRadius: widget.appearance.radius || 3,
      }}
    >
      {shown.map((item, index) => {
        const depth = (item.length - item.trimStart().length) / 2;
        return (
          <div
            key={`${item}-${index}`}
            className="flex items-center gap-1 truncate px-2 text-[11px] leading-5"
            style={{ paddingLeft: 8 + depth * 12 }}
          >
            <Circle size={4} className="shrink-0 opacity-40" fill="currentColor" />
            <span className="truncate">{item.trim()}</span>
          </div>
        );
      })}
    </div>
  );
};

// --- navigation ----------------------------------------------------------------

const MenuBar: WidgetRenderer = ({ widget }) => {
  const items = asList(widget.props.items);
  return (
    <div
      className="flex h-full w-full items-center gap-1 overflow-hidden px-1"
      style={{
        ...textStyle(widget),
        background: widget.appearance.background ?? 'rgba(127,127,127,0.14)',
      }}
    >
      {(items.length ? items : ['File', 'Edit']).map((item, index) => (
        <span key={`${item}-${index}`} className="rounded px-2 py-0.5 text-[11px]">
          {item}
        </span>
      ))}
    </div>
  );
};

const Toolbar: WidgetRenderer = ({ widget, children }) => (
  <div
    className="relative h-full w-full"
    style={{
      ...surfaceStyle(widget, 'rgba(127,127,127,0.12)'),
      borderBottom: '1px solid rgba(127,127,127,0.3)',
    }}
  >
    {children}
  </div>
);

const StatusBar: WidgetRenderer = ({ widget }) => (
  <div
    className="flex h-full w-full items-center overflow-hidden px-2"
    style={{
      ...textStyle(widget),
      background: widget.appearance.background ?? 'rgba(127,127,127,0.14)',
      borderTop: '1px solid rgba(127,127,127,0.3)',
    }}
  >
    <span className="truncate text-[11px]">{widget.text}</span>
  </div>
);

const Sidebar: WidgetRenderer = ({ widget, children }) => {
  const items = asList(widget.props.items);
  return (
    <div
      className="relative flex h-full w-full flex-col overflow-hidden"
      style={{ ...surfaceStyle(widget, 'rgba(127,127,127,0.14)'), ...padding(widget) }}
    >
      {items.length > 0 && widget.children.length === 0 && (
        <div className="flex flex-col gap-0.5 p-2">
          {items.map((item, index) => (
            <div
              key={`${item}-${index}`}
              className="truncate rounded px-2 py-1 text-[11px]"
              style={{
                ...textStyle(widget),
                background: index === 0 ? 'rgba(127,127,127,0.2)' : undefined,
              }}
            >
              {item}
            </div>
          ))}
        </div>
      )}
      {children}
    </div>
  );
};

// --- advanced ------------------------------------------------------------------

const Canvas: WidgetRenderer = ({ widget, children }) => (
  <div
    className="relative h-full w-full overflow-hidden"
    style={{
      background: asString(widget.props.background) || widget.appearance.background || '#ffffff',
      border: CONTROL_BORDER,
      borderRadius: widget.appearance.radius || undefined,
    }}
  >
    {children}
  </div>
);

const OpenGLView: WidgetRenderer = ({ widget }) => (
  <div
    className="grid h-full w-full place-items-center text-[10px] uppercase tracking-wider text-white/60"
    style={{
      background:
        widget.appearance.background ??
        'linear-gradient(135deg, #12141c 0%, #1d2233 50%, #12141c 100%)',
      borderRadius: widget.appearance.radius || undefined,
    }}
  >
    OpenGL
  </div>
);

const MarkdownViewer: WidgetRenderer = ({ widget }) => {
  const content = asString(widget.props.content);
  return (
    <div
      className="h-full w-full overflow-hidden p-2"
      style={{
        ...textStyle(widget),
        background: widget.appearance.background ?? CONTROL_BACKGROUND,
        border: CONTROL_BORDER,
        borderRadius: widget.appearance.radius || 3,
      }}
    >
      {content.split('\n').map((line, index) => {
        const heading = /^(#{1,3})\s+(.*)$/.exec(line);
        if (heading) {
          const level = heading[1].length;
          return (
            <div
              key={index}
              className="font-semibold"
              style={{ fontSize: [17, 14, 12][level - 1] ?? 12 }}
            >
              {heading[2]}
            </div>
          );
        }
        return (
          <div key={index} className="truncate text-[11px] opacity-80">
            {line}
          </div>
        );
      })}
    </div>
  );
};

const WebView: WidgetRenderer = ({ widget }) => (
  <div
    className="flex h-full w-full flex-col overflow-hidden"
    style={{ border: CONTROL_BORDER, borderRadius: widget.appearance.radius || 3 }}
  >
    <div
      className="shrink-0 truncate px-2 py-1 font-mono text-[10px]"
      style={{ background: 'rgba(127,127,127,0.18)' }}
    >
      {asString(widget.props.url, 'about:blank')}
    </div>
    <div className="grid flex-1 place-items-center text-[10px] opacity-40">Web View</div>
  </div>
);

// --- fallback ------------------------------------------------------------------

/**
 * Rendered for any type without a dedicated renderer — including widgets
 * contributed by a backend plugin that the frontend has never seen. It shows
 * the type and label so the design stays legible instead of showing a hole.
 */
export const FallbackRenderer: WidgetRenderer = ({ widget }) => (
  <div
    className="flex h-full w-full flex-col items-center justify-center gap-0.5 overflow-hidden"
    style={{
      background: widget.appearance.background ?? 'rgba(127,127,127,0.1)',
      border: '1px dashed rgba(127,127,127,0.5)',
      borderRadius: widget.appearance.radius || 3,
      ...textStyle(widget),
    }}
  >
    <span className="truncate px-1 text-[11px] font-medium">{widget.text || widget.name}</span>
    <span className="truncate px-1 text-[9px] uppercase tracking-wide opacity-50">
      {widget.type}
    </span>
  </div>
);

export const RENDERERS: Record<string, WidgetRenderer> = {
  // containers
  window: Panel,
  frame: Frame,
  group: Group,
  panel: Panel,
  tabs: Tabs,
  scrollArea: ScrollArea,
  splitter: Splitter,
  // inputs
  textbox: TextBox,
  passwordBox: PasswordBox,
  multilineText: MultilineText,
  numberInput: NumberInput,
  slider: Slider,
  checkbox: Checkbox,
  radioButton: RadioButton,
  comboBox: ComboBox,
  colorPicker: ColorPicker,
  datePicker: DatePicker,
  // buttons
  button: Button,
  toggleButton: ToggleButton,
  iconButton: IconButton,
  // display
  label: Label,
  image: ImageWidget,
  progressBar: ProgressBar,
  spinner: Spinner,
  separator: Separator,
  table: Table,
  treeView: TreeView,
  // navigation
  menuBar: MenuBar,
  toolbar: Toolbar,
  statusBar: StatusBar,
  sidebar: Sidebar,
  // advanced
  canvas: Canvas,
  openGLView: OpenGLView,
  markdownViewer: MarkdownViewer,
  webView: WebView,
};

export const rendererFor = (type: string): WidgetRenderer => RENDERERS[type] ?? FallbackRenderer;
