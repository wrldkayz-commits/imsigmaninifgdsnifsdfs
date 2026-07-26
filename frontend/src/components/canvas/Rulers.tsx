/**
 * Horizontal and vertical rulers.
 *
 * Tick spacing adapts to zoom so labels never collide: at 25% a mark every 10px
 * would be unreadable, so the step grows to keep roughly 60 screen pixels
 * between labels.
 */

const RULER_SIZE = 20;

interface RulersProps {
  zoom: number;
  pan: { x: number; y: number };
  viewport: { width: number; height: number };
  /** Design-space bounds of the current selection, highlighted on the rulers. */
  highlight: { x: number; y: number; width: number; height: number } | null;
}

export function Rulers({ zoom, pan, viewport, highlight }: RulersProps) {
  const step = tickStep(zoom);
  const startX = Math.floor(-pan.x / zoom / step) * step;
  const endX = startX + (viewport.width / zoom) + step;
  const startY = Math.floor(-pan.y / zoom / step) * step;
  const endY = startY + (viewport.height / zoom) + step;

  const xTicks: number[] = [];
  for (let value = startX; value <= endX; value += step) xTicks.push(value);
  const yTicks: number[] = [];
  for (let value = startY; value <= endY; value += step) yTicks.push(value);

  return (
    <>
      {/* corner */}
      <div
        className="absolute left-0 top-0 z-30 border-b border-r border-edge bg-surface-raised"
        style={{ width: RULER_SIZE, height: RULER_SIZE }}
      />

      {/* horizontal */}
      <div
        className="absolute top-0 z-30 overflow-hidden border-b border-edge bg-surface-raised"
        style={{ left: RULER_SIZE, right: 0, height: RULER_SIZE }}
      >
        {highlight && (
          <div
            className="absolute inset-y-0 bg-accent/25"
            style={{ left: highlight.x * zoom + pan.x, width: highlight.width * zoom }}
          />
        )}
        {xTicks.map((value) => (
          <div
            key={value}
            className="absolute bottom-0 border-l border-ink-muted/40"
            style={{ left: value * zoom + pan.x, height: value % (step * 5) === 0 ? 8 : 4 }}
          >
            {value % (step * 5) === 0 && (
              <span className="absolute left-1 top-[-11px] text-[9px] text-ink-muted">
                {value}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* vertical */}
      <div
        className="absolute left-0 z-30 overflow-hidden border-r border-edge bg-surface-raised"
        style={{ top: RULER_SIZE, bottom: 0, width: RULER_SIZE }}
      >
        {highlight && (
          <div
            className="absolute inset-x-0 bg-accent/25"
            style={{ top: highlight.y * zoom + pan.y, height: highlight.height * zoom }}
          />
        )}
        {yTicks.map((value) => (
          <div
            key={value}
            className="absolute right-0 border-t border-ink-muted/40"
            style={{ top: value * zoom + pan.y, width: value % (step * 5) === 0 ? 8 : 4 }}
          >
            {value % (step * 5) === 0 && (
              <span
                className="absolute left-[-1px] top-1 text-[9px] text-ink-muted"
                style={{ writingMode: 'vertical-rl' }}
              >
                {value}
              </span>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

function tickStep(zoom: number): number {
  const target = 12; // screen px between minor ticks
  const raw = target / zoom;
  const steps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 500, 1000];
  return steps.find((step) => step >= raw) ?? 1000;
}

export { RULER_SIZE };
