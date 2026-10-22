import { ArrowRight, Check, X, Database } from 'lucide-react';
import { formatLatency } from '../lib/format.js';

/**
 * The path a request took through the gateway: each provider attempt in order, why
 * it failed, and which one answered. A cache hit is a single step.
 *
 * `layout="column"` stacks the steps for narrow containers (the detail drawer).
 *
 * @param {{ steps: Array<{ model: string, provider: string, outcome: 'success' | 'error', errorCode?: string, latencyMs?: number, simulated?: boolean }>, cached?: boolean, layout?: 'row' | 'column' }} props
 */
export function RouteTrace({ steps, cached = false, layout = 'row', className = '' }) {
  const column = layout === 'column';
  if (cached) {
    return (
      <ol className={`flex flex-wrap items-center gap-2 ${className}`} aria-label="Request route">
        <li className="inline-flex items-center gap-2 rounded-control border border-line bg-raised px-2.5 py-1.5 text-body">
          <Database size={14} className="text-accent" aria-hidden="true" />
          Served from cache
          <span className="text-small text-muted">no provider call</span>
        </li>
      </ol>
    );
  }

  return (
    <ol
      className={`flex gap-2 ${column ? 'flex-col items-start' : 'flex-wrap items-center'} ${className}`}
      aria-label="Request route"
    >
      {steps.map((step, index) => {
        const failed = step.outcome === 'error';
        return (
          <li
            key={`${step.model}-${index}`}
            className={`inline-flex items-center gap-2 ${column && index > 0 ? 'pl-5' : ''}`}
          >
            {index > 0 ? (
              <ArrowRight
                size={14}
                className={`text-faint ${column ? 'rotate-90 -ml-5' : ''}`}
                aria-hidden="true"
              />
            ) : null}
            <span
              className={`inline-flex items-center gap-2 rounded-control border px-2.5 py-1.5 text-body ${
                failed ? 'border-line bg-raised text-muted' : 'border-control bg-surface text-ink'
              }`}
            >
              {failed ? (
                <X size={14} className="text-negative" aria-hidden="true" />
              ) : (
                <Check size={14} className="text-positive" aria-hidden="true" />
              )}
              <span className={failed ? 'line-through decoration-faint' : 'font-medium'}>
                {step.model}
              </span>
              <span className="text-small text-muted">
                {failed
                  ? `${step.simulated ? 'simulated outage' : (step.errorCode ?? 'failed').replaceAll('_', ' ')}`
                  : step.provider}
                {step.latencyMs !== undefined && step.latencyMs !== null
                  ? ` · ${formatLatency(step.latencyMs)}`
                  : ''}
              </span>
              <span className="sr-only">{failed ? 'failed' : 'answered'}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
