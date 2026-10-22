import { formatCount, formatLatency, formatPercent, formatUsd } from '../../lib/format.js';
import { Skeleton } from '../../components/ui/States.jsx';
import { deltaFor } from './insights.js';

const KPIS = [
  { key: 'requests', label: 'Requests', format: formatCount, polarity: 'neutral' },
  { key: 'costUsd', label: 'Cost', format: formatUsd, polarity: 'down-good' },
  { key: 'savedUsd', label: 'Saved by cache', format: formatUsd, polarity: 'up-good' },
  {
    key: 'cacheHitRate',
    label: 'Cache hit rate',
    format: formatPercent,
    polarity: 'up-good',
    kind: 'points',
    hint: 'Hits out of cacheable requests',
  },
  { key: 'p95LatencyMs', label: 'p95 latency', format: formatLatency, polarity: 'down-good' },
  {
    key: 'errorRate',
    label: 'Error rate',
    format: formatPercent,
    polarity: 'down-good',
    kind: 'points',
  },
];

const TONE_CLASS = { positive: 'text-positive', negative: 'text-negative', muted: 'text-muted' };

/** The headline numbers as one container split by hairlines: label, value, change. */
export function KpiStrip({ current, previous, range, loading }) {
  return (
    <dl className="grid grid-cols-2 overflow-hidden rounded-card border border-line sm:grid-cols-3 xl:grid-cols-6">
      {KPIS.map((kpi) => {
        const value = current?.[kpi.key];
        const delta = deltaFor(value, previous?.[kpi.key], {
          ...kpi,
          range,
          priorRequests: previous?.requests,
        });
        return (
          <div
            key={kpi.key}
            className="-mt-px -ml-px border-t border-l border-line px-4 py-3.5 sm:px-5"
          >
            <dt className="text-body font-medium text-muted" title={kpi.hint}>
              {kpi.label}
            </dt>
            <dd className="mt-1">
              {loading ? (
                <>
                  <Skeleton className="h-[34px] w-24" />
                  <Skeleton className="mt-1 h-4 w-28" />
                </>
              ) : (
                <>
                  <span className="num block text-kpi text-ink">{kpi.format(value)}</span>
                  <span className={`num block text-small ${TONE_CLASS[delta.tone]}`}>
                    {delta.text}
                  </span>
                </>
              )}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
