import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Page, PageHeader } from '../../components/shell/AppShell.jsx';
import { Button, TextButton } from '../../components/ui/Button.jsx';
import { CopyButton } from '../../components/ui/CopyButton.jsx';
import { Panel } from '../../components/ui/Panel.jsx';
import { Pill } from '../../components/ui/Pill.jsx';
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/States.jsx';
import { useKeys } from '../../hooks/useApi.js';
import { API_BASE_URL } from '../../lib/api.js';
import { formatCount, formatDay, formatRelative } from '../../lib/format.js';
import { CreateKeyDialog, EditLimitDialog, RevokeKeyDialog } from './KeyDialogs.jsx';

function quickStart() {
  const baseUrl = `${(API_BASE_URL || window.location.origin).replace(/\/$/, '')}/v1`;
  return `curl ${baseUrl}/chat/completions \\
  -H "Authorization: Bearer $TOKENGATE_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"model": "mock-fast", "messages": [{"role": "user", "content": "Hello"}]}'`;
}

function KeyRow({ apiKey, onEdit, onRevoke }) {
  const revoked = apiKey.status === 'revoked';
  return (
    <tr className={`border-t border-[var(--rule)] ${revoked ? 'text-muted' : ''}`}>
      <td className="py-3 pr-4">
        <p className={revoked ? 'text-muted' : 'font-medium text-ink'}>{apiKey.name}</p>
        <code className="font-mono text-small text-muted">{apiKey.maskedKey}</code>
      </td>
      <td className="num py-3 pr-4 text-right whitespace-nowrap">
        {formatCount(apiKey.rateLimitPerMinute)}
        <span className="text-muted"> /min</span>
        {!apiKey.hasCustomRateLimit ? (
          <span className="block text-small text-muted">default</span>
        ) : null}
      </td>
      <td className="hidden py-3 pr-4 pl-8 whitespace-nowrap text-muted sm:table-cell">
        {formatRelative(apiKey.lastUsedAt)}
      </td>
      <td className="num hidden py-3 pr-4 whitespace-nowrap text-muted md:table-cell">
        {formatDay(apiKey.createdAt)}
      </td>
      <td className="py-3 text-right whitespace-nowrap">
        {revoked ? (
          <Pill>Revoked {formatDay(apiKey.revokedAt)}</Pill>
        ) : (
          <span className="inline-flex gap-4">
            <TextButton onClick={() => onEdit(apiKey)}>Edit limit</TextButton>
            <TextButton onClick={() => onRevoke(apiKey)} className="text-negative">
              Revoke
            </TextButton>
          </span>
        )}
      </td>
    </tr>
  );
}

/** Below 640px each key is a two-line row: name and limit, then key and actions. */
function KeyListItem({ apiKey, onEdit, onRevoke }) {
  const revoked = apiKey.status === 'revoked';
  return (
    <li className="flex flex-col gap-1 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className={`truncate ${revoked ? 'text-muted' : 'font-medium text-ink'}`}>
          {apiKey.name}
        </span>
        <span className="num flex-none text-ink">
          {formatCount(apiKey.rateLimitPerMinute)}
          <span className="text-muted"> /min</span>
        </span>
      </div>
      <div className="flex items-center justify-between gap-3">
        <code className="truncate font-mono text-small text-muted">{apiKey.maskedKey}</code>
        {revoked ? (
          <Pill>Revoked</Pill>
        ) : (
          <span className="inline-flex flex-none gap-4">
            <TextButton onClick={() => onEdit(apiKey)}>Edit limit</TextButton>
            <TextButton onClick={() => onRevoke(apiKey)} className="text-negative">
              Revoke
            </TextButton>
          </span>
        )}
      </div>
    </li>
  );
}

export function KeysPage() {
  const keys = useKeys();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null);
  const [revoking, setRevoking] = useState(null);
  const refresh = () => keys.mutate();

  const activeCount = keys.data?.data.filter((key) => key.status === 'active').length ?? 0;

  let body;
  if (keys.error) {
    body = <ErrorState error={keys.error} onRetry={refresh} what="your API keys" />;
  } else if (!keys.data) {
    body = (
      <div className="flex flex-col gap-3">
        {[0, 1, 2].map((row) => (
          <Skeleton key={row} className="h-10 w-full" />
        ))}
      </div>
    );
  } else if (keys.data.data.length === 0) {
    body = (
      <EmptyState
        action={
          <Button size="sm" variant="primary" onClick={() => setCreating(true)}>
            Create key
          </Button>
        }
      >
        No API keys yet. Create one to send requests through the gateway.
      </EmptyState>
    );
  } else {
    body = (
      <>
        <ul className="divide-y divide-[var(--rule)] sm:hidden">
          {keys.data.data.map((apiKey) => (
            <KeyListItem
              key={apiKey.id}
              apiKey={apiKey}
              onEdit={setEditing}
              onRevoke={setRevoking}
            />
          ))}
        </ul>
        <table className="hidden w-full text-body sm:table">
          <thead>
            <tr className="text-left text-small text-muted">
              <th scope="col" className="pb-2 font-normal">
                Name and key
              </th>
              <th scope="col" className="pb-2 text-right font-normal">
                Rate limit
              </th>
              <th scope="col" className="hidden pb-2 pl-8 font-normal sm:table-cell">
                Last used
              </th>
              <th scope="col" className="hidden pb-2 font-normal md:table-cell">
                Created
              </th>
              <th scope="col" className="pb-2">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {keys.data.data.map((apiKey) => (
              <KeyRow key={apiKey.id} apiKey={apiKey} onEdit={setEditing} onRevoke={setRevoking} />
            ))}
          </tbody>
        </table>
      </>
    );
  }

  return (
    <Page>
      <PageHeader
        title="API keys"
        subtitle={
          keys.data
            ? `${formatCount(activeCount)} active. Each key has its own per-minute rate limit.`
            : 'Each key has its own per-minute rate limit.'
        }
        actions={
          <Button variant="primary" onClick={() => setCreating(true)}>
            <Plus size={16} aria-hidden="true" />
            Create key
          </Button>
        }
      />

      <Panel bodyClassName="pt-4 overflow-x-auto">{body}</Panel>

      <Panel
        title="Quick start"
        description="Any OpenAI-compatible SDK works: point its base URL at the gateway and use a TokenGate key."
        action={<CopyButton value={quickStart()} label="Copy" />}
      >
        <pre className="overflow-x-auto rounded-control bg-raised p-3 font-mono text-small leading-5 text-ink">
          {quickStart()}
        </pre>
      </Panel>

      <CreateKeyDialog open={creating} onClose={() => setCreating(false)} onCreated={refresh} />
      {editing ? (
        <EditLimitDialog
          key={editing.id}
          apiKey={editing}
          onClose={() => setEditing(null)}
          onSaved={refresh}
        />
      ) : null}
      <RevokeKeyDialog apiKey={revoking} onClose={() => setRevoking(null)} onRevoked={refresh} />
    </Page>
  );
}
