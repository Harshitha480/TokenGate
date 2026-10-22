import { RotateCw } from 'lucide-react';
import { TextButton } from './Button.jsx';

/** A loading placeholder: a flat bar at the real size of what will replace it. */
export function Skeleton({ className = '' }) {
  return <span aria-hidden="true" className={`block rounded bg-active ${className}`} />;
}

/** An empty block keeps its frame and says, in one sentence, what goes here and why. */
export function EmptyState({ children, action, className = '' }) {
  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 rounded-card border border-dashed border-control px-4 py-3 text-body text-muted ${className}`}
    >
      <p>{children}</p>
      {action}
    </div>
  );
}

/** A failure stays inside the block that failed, with a way to retry. */
export function ErrorState({ error, onRetry, what = 'this data', className = '' }) {
  return (
    <div
      role="alert"
      className={`flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-raised px-4 py-3 text-body ${className}`}
    >
      <p className="text-ink">
        <span className="mr-2 inline-block size-2 rounded-full bg-negative" aria-hidden="true" />
        Couldn&apos;t load {what}. {error?.message}
        {error?.requestId ? (
          <span className="ml-1 font-mono text-small text-muted">
            ({error.requestId.slice(0, 8)})
          </span>
        ) : null}
      </p>
      {onRetry ? (
        <TextButton onClick={onRetry}>
          <RotateCw size={14} aria-hidden="true" /> Retry
        </TextButton>
      ) : null}
    </div>
  );
}
