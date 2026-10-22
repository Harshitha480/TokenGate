import { useMemo, useState } from 'react';
import { useElementSize } from '../../hooks/useElementSize.js';
import { niceTicks, xLabelIndices } from './scale.js';

const MARGIN = { top: 12, right: 8, bottom: 28 };
const CHAR_WIDTH = 7;

/** Splits a series into runs of present values, so missing buckets show as gaps. */
function segments(points, x, y) {
  const runs = [];
  let current = [];
  points.forEach((point, index) => {
    if (point.value === null || point.value === undefined) {
      if (current.length) runs.push(current);
      current = [];
    } else {
      current.push(`${x(index).toFixed(1)},${y(point.value).toFixed(1)}`);
    }
  });
  if (current.length) runs.push(current);
  return runs;
}

/**
 * A single-series time chart: 2px straight segments in the data hue, faint solid
 * gridlines, round ticks from zero, a crosshair tooltip that also works from the
 * keyboard, optional event markers, and a hidden table for screen readers.
 *
 * @param {{
 *   points: Array<{ t: string, value: number | null }>,
 *   seriesLabel: string,
 *   formatValue: (n: number) => string,
 *   formatTick?: (n: number) => string,
 *   formatX: (t: string) => string,
 *   formatWhen: (t: string) => string,
 *   details?: (point) => Array<{ label: string, value: string }>,
 *   markers?: Set<number>,
 *   labelAt?: number[],
 *   minHeight?: number,
 * }} props
 *
 * The chart fills its container: give the container a height (or let a grid row size
 * it) and the plot takes all of it, never less than `minHeight`.
 */
export function LineChart({
  points,
  seriesLabel,
  formatValue,
  formatTick = formatValue,
  formatX,
  formatWhen,
  details,
  markers,
  labelAt,
  minHeight = 220,
}) {
  const [containerRef, size] = useElementSize();
  const { width } = size;
  const height = Math.max(size.height, minHeight);
  const [activeIndex, setActiveIndex] = useState(null);

  const geometry = useMemo(() => {
    const values = points.map((p) => p.value).filter((v) => v !== null && v !== undefined);
    const ticks = niceTicks(values.length ? Math.max(...values) : 0);
    const top = ticks.at(-1);
    const labelWidth = Math.max(...ticks.map((tick) => formatTick(tick).length)) * CHAR_WIDTH;
    const left = labelWidth + 12;
    const plotWidth = Math.max(0, width - left - MARGIN.right);
    const plotHeight = height - MARGIN.top - MARGIN.bottom;
    const x = (index) => left + (points.length > 1 ? (index / (points.length - 1)) * plotWidth : 0);
    const y = (value) => MARGIN.top + plotHeight - (value / top) * plotHeight;
    return { ticks, left, plotWidth, plotHeight, x, y };
  }, [points, width, height, formatTick]);

  const { ticks, left, plotWidth, plotHeight, x, y } = geometry;
  // Calendar-aligned labels from the caller when given; on a phone keep every other one.
  const labelIndices = labelAt
    ? labelAt.filter((_, i) => width >= 480 || i % 2 === 0)
    : xLabelIndices(points.length, width < 480 ? 4 : 6);
  const baseline = MARGIN.top + plotHeight;
  const active = activeIndex === null ? null : points[activeIndex];

  function indexAt(clientX, rect) {
    const ratio = (clientX - rect.left - left) / (plotWidth || 1);
    return Math.min(points.length - 1, Math.max(0, Math.round(ratio * (points.length - 1))));
  }

  function onKeyDown(event) {
    const moves = { ArrowLeft: -1, ArrowRight: 1, Home: -Infinity, End: Infinity };
    if (!(event.key in moves)) return;
    event.preventDefault();
    const start = activeIndex ?? points.length - 1;
    const next = Math.min(points.length - 1, Math.max(0, start + moves[event.key]));
    setActiveIndex(Number.isFinite(next) ? next : 0);
  }

  const latest = points.findLast((p) => p.value !== null && p.value !== undefined);
  const summary = `${seriesLabel}, ${points.length} intervals${
    latest ? `; latest ${formatValue(latest.value)}` : ''
  }. Use the arrow keys to read each interval.`;

  return (
    <div ref={containerRef} className="relative h-full w-full" style={{ minHeight }}>
      {width > 0 ? (
        <svg
          className="absolute inset-0 block touch-pan-y"
          width={width}
          height={height}
          role="img"
          aria-label={summary}
          tabIndex={0}
          onKeyDown={onKeyDown}
          onFocus={() => setActiveIndex((index) => index ?? points.length - 1)}
          onBlur={() => setActiveIndex(null)}
          onPointerMove={(event) =>
            setActiveIndex(indexAt(event.clientX, event.currentTarget.getBoundingClientRect()))
          }
          onPointerLeave={() => setActiveIndex(null)}
        >
          {ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={left}
                x2={left + plotWidth}
                y1={y(tick)}
                y2={y(tick)}
                stroke={tick === 0 ? 'var(--control)' : 'var(--grid)'}
                strokeWidth="1"
              />
              <text
                x={left - 8}
                y={y(tick)}
                dy="0.32em"
                textAnchor="end"
                className="num fill-[var(--faint)] text-small"
              >
                {formatTick(tick)}
              </text>
            </g>
          ))}

          {labelIndices.map((index, position, all) => {
            const isFirst = position === 0;
            const isLast = position === all.length - 1 && index > points.length * 0.8;
            return (
              <text
                key={points[index].t}
                x={x(index)}
                y={height - 8}
                textAnchor={isFirst ? 'start' : isLast ? 'end' : 'middle'}
                className="num fill-[var(--faint)] text-small"
              >
                {formatX(points[index].t)}
              </text>
            );
          })}

          {segments(points, x, y).map((run) => (
            <polyline
              key={run[0]}
              points={run.join(' ')}
              fill="none"
              stroke="var(--chart-1)"
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}

          {markers
            ? [...markers].map((index) => (
                <path
                  key={`marker-${index}`}
                  d={`M ${x(index) - 4} ${baseline} L ${x(index) + 4} ${baseline} L ${x(index)} ${baseline - 7} Z`}
                  fill="var(--negative)"
                />
              ))
            : null}

          {active ? (
            <g pointerEvents="none">
              <line
                x1={x(activeIndex)}
                x2={x(activeIndex)}
                y1={MARGIN.top}
                y2={baseline}
                stroke="var(--control)"
                strokeWidth="1"
              />
              {active.value !== null && active.value !== undefined ? (
                <circle
                  cx={x(activeIndex)}
                  cy={y(active.value)}
                  r="4"
                  fill="var(--chart-1)"
                  stroke="var(--surface)"
                  strokeWidth="2"
                />
              ) : null}
            </g>
          ) : null}
        </svg>
      ) : null}

      {active ? (
        <div
          role="status"
          className="pointer-events-none absolute top-0 z-10 min-w-36 rounded-control border border-line bg-surface px-3 py-2 text-small shadow-[var(--float-shadow)]"
          style={
            x(activeIndex) > width / 2
              ? { right: width - x(activeIndex) + 12 }
              : { left: x(activeIndex) + 12 }
          }
        >
          <p className="text-muted">{formatWhen(active.t)}</p>
          <p className="num text-body font-semibold text-ink">
            {active.value === null || active.value === undefined
              ? 'No requests'
              : formatValue(active.value)}
          </p>
          {details?.(active).map((row) => (
            <p key={row.label} className="num text-muted">
              {row.label} <span className="text-ink">{row.value}</span>
            </p>
          ))}
        </div>
      ) : null}

      <table className="sr-only">
        <caption>{seriesLabel}</caption>
        <thead>
          <tr>
            <th scope="col">Interval starting</th>
            <th scope="col">{seriesLabel}</th>
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr key={point.t}>
              <td>{formatWhen(point.t)}</td>
              <td>
                {point.value === null || point.value === undefined
                  ? 'No data'
                  : formatValue(point.value)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
