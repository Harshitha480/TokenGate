import { RouteTrace } from '../../components/RouteTrace.jsx';
import { CopyButton } from '../../components/ui/CopyButton.jsx';
import { Dialog } from '../../components/ui/Dialog.jsx';
import { Pill } from '../../components/ui/Pill.jsx';
import { ErrorState, Skeleton } from '../../components/ui/States.jsx';
import { useLog } from '../../hooks/useApi.js';
import {
  formatCount,
  formatDateTime,
  formatLatency,
  formatUsd,
  NO_VALUE,
} from '../../lib/format.js';

function Fact({ label, children }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-[var(--rule)] py-2 last:border-b-0">
      <dt className="text-body text-muted">{label}</dt>
      <dd className="num min-w-0 text-right text-body text-ink">{children}</dd>
    </div>
  );
}

function TextBlock({ title, text }) {
  return (
    <section>
      <h3 className="mb-1.5 text-body font-semibold">{title}</h3>
      <pre className="max-h-64 overflow-auto rounded-control bg-raised p-3 font-mono text-small whitespace-pre-wrap text-ink">
        {text}
      </pre>
    </section>
  );
}

function statusPill(log) {
  if (log.status === 'success') return <Pill tone="positive">{log.statusCode} OK</Pill>;
  if (log.status === 'aborted') return <Pill tone="neutral">Client disconnected</Pill>;
  return <Pill tone="negative">{`${log.statusCode} ${log.errorCode?.replaceAll('_', ' ')}`}</Pill>;
}

function LogBody({ log }) {
  const tokensNote = log.tokensEstimated ? ' (estimated)' : '';
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2">
        {statusPill(log)}
        {log.stream ? <Pill>Streamed</Pill> : null}
        {log.fallbackUsed ? <Pill tone="warning">Fallback used</Pill> : null}
      </div>

      <section>
        <h3 className="mb-2 text-body font-semibold">Route</h3>
        {log.cached || log.attempts.length > 0 ? (
          <RouteTrace steps={log.attempts} cached={log.cached} layout="column" />
        ) : (
          <p className="text-body text-muted">No provider was called.</p>
        )}
      </section>

      {log.errorMessage ? (
        <p className="rounded-control bg-[var(--pill-negative-bg)] px-3 py-2 text-body text-[var(--pill-negative-ink)]">
          {log.errorMessage}
        </p>
      ) : null}

      <dl>
        <Fact label="Request ID">
          <span className="inline-flex items-center gap-1">
            <code className="font-mono text-small">{log.requestId}</code>
            <CopyButton value={log.requestId} label="Copy" />
          </span>
        </Fact>
        <Fact label="API key">{log.apiKeyName ?? 'Deleted key'}</Fact>
        <Fact label="Requested model">{log.model}</Fact>
        <Fact label="Answered by">
          {log.servedModel ? `${log.servedModel} (${log.provider})` : NO_VALUE}
        </Fact>
        <Fact label="Cache">{log.cacheStatus}</Fact>
        <Fact label={`Prompt tokens${tokensNote}`}>{formatCount(log.promptTokens)}</Fact>
        <Fact label={`Completion tokens${tokensNote}`}>{formatCount(log.completionTokens)}</Fact>
        <Fact label="Cost">{formatUsd(log.costUsd)}</Fact>
        {log.savedUsd > 0 ? <Fact label="Saved by cache">{formatUsd(log.savedUsd)}</Fact> : null}
        <Fact label="Total latency">{formatLatency(log.latencyMs)}</Fact>
        {log.stream ? <Fact label="Time to first token">{formatLatency(log.ttftMs)}</Fact> : null}
      </dl>

      {log.prompt ? (
        <>
          <TextBlock title="Prompt" text={log.prompt} />
          {log.completion ? <TextBlock title="Completion" text={log.completion} /> : null}
        </>
      ) : (
        <p className="text-small text-muted">
          Prompt and completion text are not stored. Set LOG_PROMPTS=true on the server to keep
          them.
        </p>
      )}
    </div>
  );
}

/** The full record of one request, as a sheet docked to the right edge. */
export function LogDetail({ logId, onClose }) {
  const { data, error, isLoading, mutate } = useLog(logId);
  const log = data?.log;

  return (
    <Dialog
      open={Boolean(logId)}
      onClose={onClose}
      variant="drawer"
      title={log ? log.model : 'Request'}
      description={log ? formatDateTime(log.createdAt) : null}
    >
      {error ? (
        <ErrorState error={error} onRetry={() => mutate()} what="this request" />
      ) : isLoading || !log ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-9 w-full" />
          {[0, 1, 2, 3, 4, 5].map((row) => (
            <Skeleton key={row} className="h-5 w-full" />
          ))}
        </div>
      ) : (
        <LogBody log={log} />
      )}
    </Dialog>
  );
}
