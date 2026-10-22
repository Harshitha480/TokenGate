import { Link } from 'react-router';
import { ArrowRight } from 'lucide-react';
import { Panel } from '../../components/ui/Panel.jsx';
import { Pill } from '../../components/ui/Pill.jsx';
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/States.jsx';
import { useLogs } from '../../hooks/useApi.js';
import { formatLatency, formatWhen } from '../../lib/format.js';

/** The few most recent failures, each one click from its full detail. */
export function RecentFailures() {
  const { data, error, isLoading, mutate } = useLogs({ status: 'error', limit: 5 });

  const viewAll = (
    <Link
      to="/logs?status=error"
      className="inline-flex items-center gap-1 text-body font-medium text-ink underline-offset-4 hover:underline"
    >
      View all failed requests <ArrowRight size={14} aria-hidden="true" />
    </Link>
  );

  let body;
  if (error) {
    body = <ErrorState error={error} onRetry={() => mutate()} what="recent failures" />;
  } else if (isLoading && !data) {
    body = (
      <div className="flex flex-col gap-3">
        {[0, 1, 2].map((row) => (
          <Skeleton key={row} className="h-6 w-full" />
        ))}
      </div>
    );
  } else if (data.data.length === 0) {
    body = <EmptyState>No failed requests. Every request was answered.</EmptyState>;
  } else {
    body = (
      <ul className="divide-y divide-[var(--rule)]">
        {data.data.map((log) => (
          <li key={log.id}>
            <Link
              to={`/logs?status=error&log=${log.id}`}
              className="-mx-2 flex flex-col gap-1 rounded-control px-2 py-2.5 hover:bg-raised sm:grid sm:grid-cols-[150px_minmax(0,1fr)_auto_90px] sm:items-center sm:gap-x-4"
            >
              <span className="flex min-w-0 items-baseline justify-between gap-3 sm:contents">
                <span className="num order-2 flex-none text-body text-muted sm:order-none">
                  {formatWhen(log.createdAt)}
                </span>
                <span className="min-w-0 truncate text-body text-ink">
                  {log.model}
                  <span className="text-muted"> · {log.apiKeyName ?? 'deleted key'}</span>
                </span>
              </span>
              <span className="flex items-center justify-between gap-3 sm:contents">
                <Pill tone="negative">{`${log.statusCode} ${log.errorCode?.replaceAll('_', ' ') ?? ''}`}</Pill>
                <span className="num text-right text-body text-ink">
                  {formatLatency(log.latencyMs)}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <Panel title="Recent failures" description="Requests no provider could answer" action={viewAll}>
      {body}
    </Panel>
  );
}
