import { useSearchParams } from 'react-router';
import { Page, PageHeader } from '../../components/shell/AppShell.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Select } from '../../components/ui/Field.jsx';
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/States.jsx';
import { UnderlineTabs } from '../../components/ui/UnderlineTabs.jsx';
import { useKeys, useLogs, useModels } from '../../hooks/useApi.js';
import { formatCount } from '../../lib/format.js';
import { LogDetail } from './LogDetail.jsx';
import { LogsTable } from './LogsTable.jsx';

const PAGE_SIZE = 25;

const STATUS_TABS = [
  { value: '', label: 'All' },
  { value: 'success', label: 'Succeeded' },
  { value: 'error', label: 'Failed' },
  { value: 'aborted', label: 'Disconnected' },
];

function FilterSelect({ label, value, onChange, children }) {
  return (
    <label className="flex min-w-0 items-center gap-2 text-body text-muted">
      {/* On a phone the three filters share one row; the selects name themselves. */}
      <span className="sr-only flex-none sm:not-sr-only">{label}</span>
      <Select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-8 w-full sm:w-auto sm:min-w-36"
      >
        {children}
      </Select>
    </label>
  );
}

export function LogsPage() {
  const [params, setParams] = useSearchParams();
  const filters = {
    status: params.get('status') ?? '',
    model: params.get('model') ?? '',
    apiKeyId: params.get('apiKeyId') ?? '',
    cached: params.get('cached') ?? '',
    page: Number(params.get('page')) || 1,
  };
  const openLogId = params.get('log');

  const logs = useLogs({ ...filters, limit: PAGE_SIZE });
  const models = useModels();
  const keys = useKeys();

  // Changing a filter resets paging; opening a log keeps the list where it is.
  function updateParams(changes, { resetPage = true } = {}) {
    const next = new URLSearchParams(params);
    for (const [name, value] of Object.entries(changes)) {
      if (value === '' || value === null || value === undefined) next.delete(name);
      else next.set(name, String(value));
    }
    if (resetPage) next.delete('page');
    setParams(next);
  }

  const pagination = logs.data?.pagination;
  const firstShown = pagination ? (pagination.page - 1) * pagination.limit + 1 : 0;
  const lastShown = pagination ? Math.min(pagination.total, pagination.page * pagination.limit) : 0;
  const hasFilters = Boolean(filters.status || filters.model || filters.apiKeyId || filters.cached);

  let body;
  if (logs.error) {
    body = <ErrorState error={logs.error} onRetry={() => logs.mutate()} what="requests" />;
  } else if (!logs.data) {
    body = (
      <div className="flex flex-col gap-2 pt-2">
        {Array.from({ length: 8 }, (_, row) => (
          <Skeleton key={row} className="h-9 w-full" />
        ))}
      </div>
    );
  } else if (logs.data.data.length === 0) {
    body = (
      <EmptyState
        action={
          hasFilters ? (
            <Button size="sm" onClick={() => setParams({})}>
              Clear filters
            </Button>
          ) : null
        }
      >
        {hasFilters
          ? 'No requests match these filters.'
          : 'No requests yet. Call /v1/chat/completions with one of your keys, or use the Playground.'}
      </EmptyState>
    );
  } else {
    body = (
      <div className={logs.isValidating ? 'opacity-60 transition-opacity duration-150' : ''}>
        <LogsTable
          logs={logs.data.data}
          onOpen={(id) => updateParams({ log: id }, { resetPage: false })}
        />
      </div>
    );
  }

  return (
    <Page>
      <PageHeader
        title="Requests"
        subtitle="Every call through the gateway, newest first. Open one to see the route it took."
      />

      <div className="flex flex-col gap-4">
        <UnderlineTabs
          label="Filter by result"
          tabs={STATUS_TABS}
          value={filters.status}
          onChange={(status) => updateParams({ status })}
        />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="grid w-full grid-cols-3 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center sm:gap-3">
            <FilterSelect
              label="Model"
              value={filters.model}
              onChange={(model) => updateParams({ model })}
            >
              <option value="">Any model</option>
              {models.data?.data.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.displayName}
                </option>
              ))}
            </FilterSelect>
            <FilterSelect
              label="Key"
              value={filters.apiKeyId}
              onChange={(apiKeyId) => updateParams({ apiKeyId })}
            >
              <option value="">Any key</option>
              {keys.data?.data.map((key) => (
                <option key={key.id} value={key.id}>
                  {key.name}
                  {key.status === 'revoked' ? ' (revoked)' : ''}
                </option>
              ))}
            </FilterSelect>
            <FilterSelect
              label="Cache"
              value={filters.cached}
              onChange={(cached) => updateParams({ cached })}
            >
              <option value="">Cache: any</option>
              <option value="true">Cache hits</option>
              <option value="false">Not from cache</option>
            </FilterSelect>
          </div>
          {pagination ? (
            <p className="num text-body text-muted">{formatCount(pagination.total)} requests</p>
          ) : null}
        </div>

        {body}

        {pagination && pagination.total > 0 ? (
          <div className="flex items-center justify-between gap-3 pt-1">
            <p className="num text-body text-muted">
              {formatCount(firstShown)}–{formatCount(lastShown)} of {formatCount(pagination.total)}
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={pagination.page <= 1}
                onClick={() => updateParams({ page: pagination.page - 1 }, { resetPage: false })}
              >
                Previous
              </Button>
              <Button
                size="sm"
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => updateParams({ page: pagination.page + 1 }, { resetPage: false })}
              >
                Next
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      <LogDetail
        logId={openLogId}
        onClose={() => updateParams({ log: null }, { resetPage: false })}
      />
    </Page>
  );
}
