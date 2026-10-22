import { ArrowRight } from 'lucide-react';
import { Pill } from '../../components/ui/Pill.jsx';
import { formatCount, formatLatency, formatUsdFixed, formatWhen } from '../../lib/format.js';

function ModelCell({ log }) {
  const fellBack = log.servedModel && log.servedModel !== log.model;
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span className="truncate text-ink">{log.model}</span>
      {fellBack ? (
        <>
          <ArrowRight size={12} className="flex-none text-faint" aria-label="fell back to" />
          <span className="truncate text-muted">{log.servedModel}</span>
        </>
      ) : null}
    </span>
  );
}

/** One status mark per row: a pill only when something needs a look. */
function ResultCell({ log }) {
  if (log.status === 'error') {
    return (
      <Pill tone="negative">{`${log.statusCode} ${log.errorCode?.replaceAll('_', ' ') ?? ''}`}</Pill>
    );
  }
  if (log.status === 'aborted') return <Pill>Disconnected</Pill>;
  if (log.cached) return <Pill tone="accent">Cache hit</Pill>;
  if (log.fallbackUsed) return <Pill tone="warning">Fallback</Pill>;
  return <span className="text-muted">OK</span>;
}

function tokens(log) {
  const prefix = log.tokensEstimated ? '~' : '';
  return `${prefix}${formatCount(log.promptTokens)} / ${formatCount(log.completionTokens)}`;
}

const NUM = 'num text-right whitespace-nowrap';

/**
 * Requests as a table from 768px up, as two-line rows below that. Each row opens the
 * request's detail; the time is a real button so it works from the keyboard.
 */
export function LogsTable({ logs, onOpen }) {
  return (
    <>
      <table className="hidden w-full table-fixed text-body md:table">
        <thead>
          <tr className="text-left text-small text-muted">
            <th scope="col" className="w-[132px] pb-2 font-normal">
              Time
            </th>
            <th scope="col" className="pb-2 font-normal">
              Model
            </th>
            <th scope="col" className="hidden w-[140px] pb-2 font-normal xl:table-cell">
              Key
            </th>
            <th scope="col" className="w-[190px] pb-2 font-normal">
              Result
            </th>
            <th scope="col" className={`w-[120px] pb-2 font-normal ${NUM}`}>
              Tokens in / out
            </th>
            <th scope="col" className={`w-[104px] pb-2 font-normal ${NUM}`}>
              Cost
            </th>
            <th scope="col" className={`w-[88px] pb-2 font-normal ${NUM}`}>
              Latency
            </th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log) => (
            <tr
              key={log.id}
              onClick={() => onOpen(log.id)}
              className="h-12 cursor-pointer border-t border-[var(--rule)] hover:bg-raised"
            >
              <td>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpen(log.id);
                  }}
                  className="num text-left text-muted hover:text-ink"
                >
                  {formatWhen(log.createdAt)}
                </button>
              </td>
              <td className="pr-4">
                <ModelCell log={log} />
              </td>
              <td className="hidden truncate pr-4 text-muted xl:table-cell">
                {log.apiKeyName ?? '—'}
              </td>
              <td>
                <ResultCell log={log} />
              </td>
              <td className={`${NUM} text-muted`}>{tokens(log)}</td>
              <td className={`${NUM} text-ink`}>{formatUsdFixed(log.costUsd)}</td>
              <td className={`${NUM} text-ink`}>{formatLatency(log.latencyMs)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <ul className="divide-y divide-[var(--rule)] md:hidden">
        {logs.map((log) => (
          <li key={log.id}>
            <button
              type="button"
              onClick={() => onOpen(log.id)}
              className="flex w-full flex-col gap-1 py-3 text-left"
            >
              <span className="flex w-full items-center justify-between gap-3">
                <ModelCell log={log} />
                <span className="num flex-none text-ink">{formatLatency(log.latencyMs)}</span>
              </span>
              <span className="flex w-full items-center justify-between gap-3 text-small text-muted">
                <span className="num">
                  {formatWhen(log.createdAt)} · {formatUsdFixed(log.costUsd)}
                </span>
                <ResultCell log={log} />
              </span>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
