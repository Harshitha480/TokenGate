import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '../../lib/api.js';
import { readServerSentEvents } from '../../lib/sse.js';

const IDLE = { phase: 'idle', text: '', reasoning: '', headers: null, error: null, record: null };

function readGatewayHeaders(response) {
  const header = (name) => response.headers.get(name);
  return {
    requestId: header('x-request-id'),
    provider: header('x-tokengate-provider'),
    model: header('x-tokengate-model'),
    latencyMs: Number(header('x-tokengate-latency-ms')),
    cache: header('x-tokengate-cache'),
    fallback: header('x-tokengate-fallback') === 'true',
    rateLimit: header('x-ratelimit-limit'),
    rateRemaining: header('x-ratelimit-remaining'),
  };
}

/** The server writes the request log just after responding; poll briefly for it. */
async function fetchRecord(requestId, signal) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { data } = await apiFetch(
      `/api/logs?requestId=${encodeURIComponent(requestId)}&limit=1`,
      {
        signal,
      },
    );
    if (data.length > 0) return data[0];
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return null;
}

/**
 * Sends one Playground request through the gateway (as the selected key) and exposes
 * its progress: the streamed text as it arrives, the gateway's response headers, and
 * afterwards the server's own record of the route the request took.
 */
export function usePlaygroundRequest() {
  const [state, setState] = useState(IDLE);
  const controllerRef = useRef(null);
  const startedAtRef = useRef(0);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const stop = useCallback(() => controllerRef.current?.abort(), []);

  const send = useCallback(async ({ keyId, body, simulateFailure, forceCache }) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    startedAtRef.current = performance.now();
    setState({ ...IDLE, phase: 'waiting' });

    let headers = null;
    try {
      const response = await apiFetch('/api/playground/chat/completions', {
        method: 'POST',
        body,
        raw: true,
        signal: controller.signal,
        headers: {
          'X-TokenGate-Key-Id': keyId,
          ...(simulateFailure && { 'X-TokenGate-Simulate-Failure': 'primary' }),
          ...(forceCache && { 'X-TokenGate-Cache': 'force' }),
        },
      });
      headers = readGatewayHeaders(response);
      setState((s) => ({ ...s, phase: 'receiving', headers }));

      if (body.stream) {
        for await (const data of readServerSentEvents(response.body)) {
          if (data === '[DONE]') break;
          const chunk = JSON.parse(data);
          if (chunk.error) {
            setState((s) => ({ ...s, error: { ...chunk.error, midStream: true } }));
            break;
          }
          const delta = chunk.choices?.[0]?.delta ?? {};
          const reasoning = delta.reasoning_content ?? delta.reasoning ?? '';
          const content = delta.content ?? '';
          if (reasoning || content) {
            setState((s) => ({ ...s, text: s.text + content, reasoning: s.reasoning + reasoning }));
          }
        }
      } else {
        const json = await response.json();
        const message = json.choices?.[0]?.message ?? {};
        setState((s) => ({
          ...s,
          text: message.content ?? '',
          reasoning: message.reasoning_content ?? message.reasoning ?? '',
        }));
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        setState((s) => ({ ...s, phase: 'stopped' }));
      } else {
        setState((s) => ({ ...s, phase: 'done', error }));
      }
    }

    const totalMs = Math.round(performance.now() - startedAtRef.current);
    setState((s) => (s.phase === 'stopped' ? { ...s, totalMs } : { ...s, phase: 'done', totalMs }));

    const requestId = headers?.requestId;
    if (requestId) {
      fetchRecord(requestId, controller.signal)
        .then((record) => setState((s) => ({ ...s, record })))
        .catch(() => {});
    }
  }, []);

  return { ...state, send, stop };
}
