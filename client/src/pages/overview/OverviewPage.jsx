import { useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { RefreshCw } from 'lucide-react';
import { mutate as mutateAll } from 'swr';
import { Page, PageHeader } from '../../components/shell/AppShell.jsx';
import { Segmented } from '../../components/ui/Segmented.jsx';
import { ErrorState, Skeleton } from '../../components/ui/States.jsx';
import { useModels, useOverview } from '../../hooks/useApi.js';
import { formatTime } from '../../lib/format.js';
import { KpiStrip } from './KpiStrip.jsx';
import { ModelPanel } from './ModelPanel.jsx';
import { RecentFailures } from './RecentFailures.jsx';
import { TrafficPanel } from './TrafficPanel.jsx';
import { findingFor } from './insights.js';

const RANGE_OPTIONS = [
  { value: '24h', label: '24h' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
];

export function OverviewPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const range = RANGE_OPTIONS.some((o) => o.value === searchParams.get('range'))
    ? searchParams.get('range')
    : '24h';

  const overview = useOverview(range);
  const models = useModels();
  const displayNames = useMemo(
    () => new Map((models.data?.data ?? []).map((model) => [model.id, model.displayName])),
    [models.data],
  );

  // Refresh every dashboard query at once, so all blocks agree on the same moment.
  const refresh = () => mutateAll((key) => typeof key === 'string' && key.startsWith('/api/'));

  return (
    <Page>
      <PageHeader
        title="Overview"
        subtitle={
          overview.data ? (
            findingFor(overview.data.current, range)
          ) : overview.error ? null : (
            <Skeleton className="mt-1 h-4 w-96 max-w-full" />
          )
        }
        actions={
          <>
            <Segmented
              label="Time range"
              options={RANGE_OPTIONS}
              value={range}
              onChange={(value) => setSearchParams({ range: value })}
            />
            <button
              type="button"
              onClick={refresh}
              className="inline-flex h-8 items-center gap-1.5 rounded-control px-2 text-small text-muted hover:bg-raised hover:text-ink"
            >
              <RefreshCw
                size={14}
                aria-hidden="true"
                className={overview.isValidating ? 'animate-spin' : ''}
              />
              {overview.data ? `Updated ${formatTime(overview.data.to)}` : 'Refresh'}
            </button>
          </>
        }
      />

      {overview.error ? (
        <ErrorState error={overview.error} onRetry={() => overview.mutate()} what="the overview" />
      ) : (
        <KpiStrip
          current={overview.data?.current}
          previous={overview.data?.previous}
          range={range}
          loading={!overview.data}
        />
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <TrafficPanel range={range} />
        <ModelPanel range={range} displayNames={displayNames} />
      </div>

      <RecentFailures />
    </Page>
  );
}
