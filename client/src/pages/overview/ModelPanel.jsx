import { BarList } from '../../components/charts/BarList.jsx';
import { Panel } from '../../components/ui/Panel.jsx';
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/States.jsx';
import { useByModel } from '../../hooks/useApi.js';
import { formatCount, formatPercent, formatUsd } from '../../lib/format.js';

/** Requests per model, attributed to the model that actually answered. */
export function ModelPanel({ range, displayNames }) {
  const { data, error, isLoading, mutate } = useByModel(range);

  let body;
  if (error) {
    body = <ErrorState error={error} onRetry={() => mutate()} what="model usage" />;
  } else if (isLoading && !data) {
    body = (
      <div className="flex flex-col gap-4">
        {[0, 1, 2].map((row) => (
          <div key={row}>
            <Skeleton className="h-5 w-full" />
            <Skeleton className="mt-1.5 h-2 w-2/3" />
          </div>
        ))}
      </div>
    );
  } else if (data.data.length === 0) {
    body = <EmptyState>No model has served a request in this range.</EmptyState>;
  } else {
    body = (
      <BarList
        label="Requests by model"
        rows={data.data.map((row) => ({
          key: row.model,
          label: displayNames.get(row.model) ?? row.model,
          value: row.requests,
          display: formatCount(row.requests),
          detail: `${formatUsd(row.costUsd)}${
            row.errorCount > 0 ? ` · ${formatPercent(row.errorRate)} failed` : ''
          }`,
        }))}
      />
    );
  }

  return (
    <Panel title="By model" description="Requests, with cost underneath">
      {body}
    </Panel>
  );
}
