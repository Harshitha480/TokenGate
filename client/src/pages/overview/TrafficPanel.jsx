import { useMemo, useState } from 'react';
import { LineChart } from '../../components/charts/LineChart.jsx';
import { Panel } from '../../components/ui/Panel.jsx';
import { Segmented } from '../../components/ui/Segmented.jsx';
import { ErrorState, Skeleton } from '../../components/ui/States.jsx';
import { useTimeseries } from '../../hooks/useApi.js';
import {
  formatCount,
  formatDateTime,
  formatDay,
  formatLatency,
  formatTime,
  formatUsd,
  RANGE_LABELS,
} from '../../lib/format.js';

const METRICS = {
  requests: {
    label: 'Requests',
    seriesLabel: 'Requests per interval',
    formatValue: (v) => `${formatCount(v)} requests`,
    formatTick: formatCount,
    details: (p) => (p.errors > 0 ? [{ label: 'Failed', value: formatCount(p.errors) }] : []),
  },
  cost: {
    label: 'Cost',
    seriesLabel: 'Cost per interval',
    formatValue: formatUsd,
    formatTick: formatUsd,
    details: (p) => (p.saved > 0 ? [{ label: 'Saved by cache', value: formatUsd(p.saved) }] : []),
  },
  latency: {
    label: 'Latency',
    seriesLabel: 'Average latency per interval',
    formatValue: (v) => `${formatLatency(v)} average`,
    formatTick: formatLatency,
    details: (p) => (p.p95 !== null ? [{ label: 'p95', value: formatLatency(p.p95) }] : []),
  },
};

const METRIC_OPTIONS = Object.entries(METRICS).map(([value, { label }]) => ({ value, label }));

/** One series at a time, switched with a segmented control rather than overlaid. */
export function TrafficPanel({ range }) {
  const [metric, setMetric] = useState('requests');
  const { data, error, isLoading, isValidating, mutate } = useTimeseries(range, metric);
  const config = METRICS[metric];

  const errorBuckets = useMemo(() => {
    if (metric !== 'requests' || !data) return null;
    return new Set(data.points.flatMap((point, index) => (point.errors > 0 ? [index] : [])));
  }, [data, metric]);

  const formatX = range === '24h' ? formatTime : formatDay;

  return (
    <Panel
      title="Traffic"
      description={`${config.seriesLabel}, ${RANGE_LABELS[range]}`}
      className="lg:col-span-2"
      bodyClassName="flex flex-col"
      action={
        <>
          {errorBuckets?.size ? (
            <span className="inline-flex items-center gap-1.5 text-small text-muted">
              <svg width="10" height="9" aria-hidden="true">
                <path d="M0 9 L10 9 L5 1 Z" fill="var(--negative)" />
              </svg>
              Intervals with failures
            </span>
          ) : null}
          <Segmented
            label="Chart metric"
            options={METRIC_OPTIONS}
            value={metric}
            onChange={setMetric}
          />
        </>
      }
    >
      {error ? (
        <ErrorState error={error} onRetry={() => mutate()} what="the traffic chart" />
      ) : isLoading && !data ? (
        <Skeleton className="h-[220px] w-full" />
      ) : (
        <div
          className={`flex flex-1 flex-col transition-opacity duration-150 ${isValidating ? 'opacity-60' : ''}`}
        >
          <LineChart
            points={data.points}
            seriesLabel={config.seriesLabel}
            formatValue={config.formatValue}
            formatTick={config.formatTick}
            formatX={formatX}
            formatWhen={formatDateTime}
            details={config.details}
            markers={errorBuckets}
          />
        </div>
      )}
    </Panel>
  );
}
