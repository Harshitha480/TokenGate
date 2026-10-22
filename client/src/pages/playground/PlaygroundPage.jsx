import { useState } from 'react';
import { Link } from 'react-router';
import { Send, Square } from 'lucide-react';
import { RouteTrace } from '../../components/RouteTrace.jsx';
import { Page, PageHeader } from '../../components/shell/AppShell.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { CopyButton } from '../../components/ui/CopyButton.jsx';
import { Field, Select, Switch, TextArea, TextInput } from '../../components/ui/Field.jsx';
import { Panel } from '../../components/ui/Panel.jsx';
import { Pill } from '../../components/ui/Pill.jsx';
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/States.jsx';
import { useKeys, useModels } from '../../hooks/useApi.js';
import { formatCount, formatLatency, formatUsd } from '../../lib/format.js';
import { usePlaygroundRequest } from './usePlaygroundRequest.js';

const DEFAULT_PROMPT = 'In two sentences, why is the sky blue?';

function priceLabel(model) {
  return `$${model.pricing.inputPer1M} in / $${model.pricing.outputPer1M} out per 1M`;
}

function HeaderRow({ name, children }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-[var(--rule)] py-2 last:border-b-0">
      <dt className="font-mono text-small text-muted">{name}</dt>
      <dd className="num min-w-0 text-right text-body text-ink">{children}</dd>
    </div>
  );
}

function ResponseHeaders({ headers, stream }) {
  return (
    <dl>
      <HeaderRow name="X-TokenGate-Provider">{headers.provider}</HeaderRow>
      <HeaderRow name="X-TokenGate-Model">{headers.model}</HeaderRow>
      <HeaderRow name="X-TokenGate-Cache">
        <Pill tone={headers.cache === 'HIT' ? 'accent' : 'neutral'}>{headers.cache}</Pill>
      </HeaderRow>
      <HeaderRow name="X-TokenGate-Fallback">
        {headers.fallback ? <Pill tone="warning">true</Pill> : 'false'}
      </HeaderRow>
      <HeaderRow name="X-TokenGate-Latency-Ms">
        {formatLatency(headers.latencyMs)}
        {stream ? <span className="block text-small text-muted">time to first token</span> : null}
      </HeaderRow>
      {headers.rateLimit ? (
        <HeaderRow name="X-RateLimit-Remaining">
          {headers.rateRemaining} of {headers.rateLimit} this minute
        </HeaderRow>
      ) : null}
      <HeaderRow name="X-Request-Id">
        <span className="inline-flex items-center gap-1">
          <code className="font-mono text-small">{headers.requestId?.slice(0, 13)}…</code>
          <CopyButton value={headers.requestId} label="Copy" />
        </span>
      </HeaderRow>
    </dl>
  );
}

function ResponsePanel({ request, stream }) {
  const { phase, text, reasoning, headers, error, record, totalMs } = request;
  const busy = phase === 'waiting' || phase === 'receiving';

  let status =
    'Send a prompt to see the response, the headers TokenGate adds and the route it took.';
  if (phase === 'waiting') status = 'Waiting for the first token…';
  if (phase === 'receiving') status = stream ? 'Streaming…' : 'Receiving…';
  if (phase === 'done' && totalMs !== undefined) status = `Finished in ${formatLatency(totalMs)}`;
  if (phase === 'stopped') status = 'Stopped. The gateway cancelled the upstream request.';

  return (
    <Panel title="Response" description={status}>
      <div className="flex flex-col gap-6">
        {error && !error.midStream ? (
          <div
            role="alert"
            className="rounded-control bg-[var(--pill-negative-bg)] px-3 py-2.5 text-body text-[var(--pill-negative-ink)]"
          >
            <p className="font-medium">
              {error.status ? `${error.status} ` : ''}
              {error.code}
            </p>
            <p>{error.message}</p>
          </div>
        ) : null}

        {phase === 'waiting' ? <Skeleton className="h-20 w-full" /> : null}

        {reasoning ? (
          <details className="rounded-control border border-line px-3 py-2">
            <summary className="text-body text-muted">
              Reasoning ({formatCount(reasoning.length)} characters)
            </summary>
            <p className="mt-2 text-body whitespace-pre-wrap text-muted">{reasoning}</p>
          </details>
        ) : null}

        {text || (phase === 'done' && !error) ? (
          <p
            className="text-section leading-7 whitespace-pre-wrap text-ink"
            aria-live={busy ? 'polite' : 'off'}
          >
            {text || <span className="text-muted">The model returned no text.</span>}
          </p>
        ) : null}

        {error?.midStream ? (
          <p
            role="alert"
            className="rounded-control bg-[var(--pill-negative-bg)] px-3 py-2 text-body text-[var(--pill-negative-ink)]"
          >
            The stream broke after it started ({error.code}). Fallback only happens before the first
            byte, so the partial answer above is all there is.
          </p>
        ) : null}

        {record ? (
          <section>
            <h3 className="mb-2 text-body font-semibold">Route</h3>
            <RouteTrace steps={record.attempts ?? []} cached={record.cached} />
            <p className="num mt-2 text-small text-muted">
              {formatCount(record.promptTokens)} prompt + {formatCount(record.completionTokens)}{' '}
              completion tokens{record.tokensEstimated ? ' (estimated)' : ''} ·{' '}
              {record.cached
                ? `saved ${formatUsd(record.savedUsd)}`
                : `cost ${formatUsd(record.costUsd)}`}{' '}
              ·{' '}
              <Link
                to={`/logs?log=${record.id}`}
                className="text-ink underline-offset-4 hover:underline"
              >
                Open in Requests
              </Link>
            </p>
          </section>
        ) : null}

        {headers ? (
          <section>
            <h3 className="mb-1 text-body font-semibold">Response headers</h3>
            <ResponseHeaders headers={headers} stream={stream} />
          </section>
        ) : null}
      </div>
    </Panel>
  );
}

export function PlaygroundPage() {
  const keys = useKeys();
  const models = useModels();
  const request = usePlaygroundRequest();

  const activeKeys = keys.data?.data.filter((key) => key.status === 'active') ?? [];
  const modelList = models.data?.data ?? [];

  const [keyId, setKeyId] = useState('');
  const [modelId, setModelId] = useState('mock-fast');
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [stream, setStream] = useState(true);
  const [temperature, setTemperature] = useState('0.7');
  const [maxTokens, setMaxTokens] = useState('512');
  const [simulateFailure, setSimulateFailure] = useState(false);
  const [forceCache, setForceCache] = useState(false);

  // Derived, not stored: fall back to the first active key until one is chosen.
  const selectedKeyId = activeKeys.some((key) => key.id === keyId) ? keyId : activeKeys[0]?.id;
  const selectedModel = modelList.find((model) => model.id === modelId);
  const hasFallback = (selectedModel?.fallbacks.length ?? 0) > 0;
  const busy = request.phase === 'waiting' || request.phase === 'receiving';

  function submit(event) {
    event.preventDefault();
    const temperatureValue = Number(temperature);
    request.send({
      keyId: selectedKeyId,
      simulateFailure: simulateFailure && hasFallback,
      forceCache: forceCache && !stream,
      body: {
        model: modelId,
        messages: [{ role: 'user', content: prompt }],
        temperature: temperatureValue,
        max_tokens: Number(maxTokens),
        stream,
        ...(stream && { stream_options: { include_usage: true } }),
      },
    });
  }

  if (keys.error || models.error) {
    return (
      <Page>
        <PageHeader title="Playground" />
        <ErrorState
          error={keys.error ?? models.error}
          onRetry={() => (keys.error ? keys.mutate() : models.mutate())}
          what="the playground"
        />
      </Page>
    );
  }

  const loading = !keys.data || !models.data;

  return (
    <Page>
      <PageHeader
        title="Playground"
        subtitle="Send a prompt through the gateway as one of your keys and watch what TokenGate does with it."
      />

      {!loading && activeKeys.length === 0 ? (
        <EmptyState
          action={
            <Link
              to="/keys"
              className="text-body font-medium text-ink underline-offset-4 hover:underline"
            >
              Create a key
            </Link>
          }
        >
          The Playground sends requests as one of your API keys, and you have no active keys.
        </EmptyState>
      ) : null}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(320px,400px)_minmax(0,1fr)]">
        <Panel title="Request">
          {loading ? (
            <div className="flex flex-col gap-4">
              {[0, 1, 2, 3].map((row) => (
                <Skeleton key={row} className="h-14 w-full" />
              ))}
            </div>
          ) : (
            <form onSubmit={submit} className="flex flex-col gap-4">
              <Field label="API key">
                {(props) => (
                  <Select
                    {...props}
                    value={selectedKeyId ?? ''}
                    onChange={(e) => setKeyId(e.target.value)}
                    disabled={activeKeys.length === 0}
                  >
                    {activeKeys.map((key) => (
                      <option key={key.id} value={key.id}>
                        {key.name} ({key.rateLimitPerMinute}/min)
                      </option>
                    ))}
                  </Select>
                )}
              </Field>

              <Field label="Model" hint={selectedModel ? priceLabel(selectedModel) : null}>
                {(props) => (
                  <Select {...props} value={modelId} onChange={(e) => setModelId(e.target.value)}>
                    {modelList.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.displayName}
                        {model.available ? '' : ' (provider key missing)'}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>

              <Field label="Prompt">
                {(props) => (
                  <TextArea
                    {...props}
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    required
                    rows={5}
                  />
                )}
              </Field>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Temperature" hint="0 makes it cacheable">
                  {(props) => (
                    <TextInput
                      {...props}
                      type="number"
                      min={0}
                      max={2}
                      step={0.1}
                      value={temperature}
                      onChange={(e) => setTemperature(e.target.value)}
                    />
                  )}
                </Field>
                <Field label="Max tokens">
                  {(props) => (
                    <TextInput
                      {...props}
                      type="number"
                      min={1}
                      max={65536}
                      value={maxTokens}
                      onChange={(e) => setMaxTokens(e.target.value)}
                    />
                  )}
                </Field>
              </div>

              <div className="flex flex-col gap-4 border-t border-line pt-4">
                <Switch
                  checked={stream}
                  onChange={setStream}
                  label="Stream the response"
                  description="Server-Sent Events, token by token."
                />
                <Switch
                  checked={simulateFailure && hasFallback}
                  onChange={setSimulateFailure}
                  disabled={!hasFallback}
                  label="Make the primary provider fail"
                  description={
                    hasFallback
                      ? `Injects a mock outage on ${modelId} so ${selectedModel.fallbacks[0]} answers instead.`
                      : 'This model has no fallback configured.'
                  }
                />
                <Switch
                  checked={forceCache && !stream}
                  onChange={setForceCache}
                  disabled={stream}
                  label="Force caching"
                  description={
                    stream ? 'Streams are never cached.' : 'Cache even when temperature is above 0.'
                  }
                />
              </div>

              <div className="flex gap-2 pt-1">
                {busy ? (
                  <Button onClick={request.stop} className="flex-1">
                    <Square size={14} aria-hidden="true" /> Stop
                  </Button>
                ) : (
                  <Button
                    type="submit"
                    variant="primary"
                    className="flex-1"
                    disabled={!selectedKeyId || prompt.trim() === ''}
                  >
                    <Send size={14} aria-hidden="true" /> Send request
                  </Button>
                )}
              </div>
            </form>
          )}
        </Panel>

        <ResponsePanel request={request} stream={stream} />
      </div>
    </Page>
  );
}
