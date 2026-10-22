const { executeWithFallback } = require('../../src/services/fallback');
const { ProviderError, fromUpstreamStatus } = require('../../src/providers/providerError');
const { simulatedOutageError } = require('../../src/providers/mockProvider');

const route = [
  { id: 'primary', provider: 'nvidia' },
  { id: 'secondary', provider: 'nvidia' },
  { id: 'tertiary', provider: 'mock' },
];

/** An attempt function that plays back one outcome per model id. */
function scripted(outcomes) {
  const calls = [];
  const attempt = async (model) => {
    calls.push(model.id);
    const outcome = outcomes[model.id];
    if (outcome instanceof Error) throw outcome;
    return outcome;
  };
  return { attempt, calls };
}

const outage = (provider = 'nvidia') => fromUpstreamStatus(provider, 503, 'down');
const badRequest = () => fromUpstreamStatus('nvidia', 400, 'bad input');

describe('executeWithFallback', () => {
  it('uses the primary when it succeeds', async () => {
    const { attempt, calls } = scripted({ primary: 'from primary' });

    const result = await executeWithFallback({ route, attempt });

    expect(result).toMatchObject({ ok: true, value: 'from primary', model: route[0] });
    expect(calls).toEqual(['primary']);
    expect(result.attempts).toEqual([
      expect.objectContaining({ model: 'primary', provider: 'nvidia', outcome: 'success' }),
    ]);
  });

  it('moves down the chain past retryable failures', async () => {
    const onFallback = jest.fn();
    const { attempt, calls } = scripted({
      primary: outage(),
      secondary: new ProviderError({
        provider: 'nvidia',
        status: 504,
        code: 'upstream_timeout',
        message: 'slow',
        retryable: true,
      }),
      tertiary: 'from tertiary',
    });

    const result = await executeWithFallback({ route, attempt, onFallback });

    expect(result).toMatchObject({ ok: true, value: 'from tertiary', model: route[2] });
    expect(calls).toEqual(['primary', 'secondary', 'tertiary']);
    expect(result.attempts.map((a) => [a.model, a.outcome, a.errorCode ?? null])).toEqual([
      ['primary', 'error', 'upstream_error'],
      ['secondary', 'error', 'upstream_timeout'],
      ['tertiary', 'success', null],
    ]);
    expect(onFallback).toHaveBeenCalledTimes(2);
    expect(onFallback.mock.calls[0][0]).toMatchObject({ from: route[0], to: route[1] });
  });

  it('stops at a client error instead of trying other providers', async () => {
    const { attempt, calls } = scripted({ primary: badRequest(), secondary: 'unused' });

    const result = await executeWithFallback({ route, attempt });

    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('upstream_rejected_request');
    expect(calls).toEqual(['primary']);
  });

  it('stops when the client has gone away', async () => {
    const controller = new AbortController();
    controller.abort();
    const { attempt, calls } = scripted({ primary: outage(), secondary: 'unused' });

    const result = await executeWithFallback({ route, attempt, signal: controller.signal });

    expect(result.ok).toBe(false);
    expect(calls).toEqual(['primary']);
  });

  it('does not treat unexpected bugs as provider outages', async () => {
    const { attempt, calls } = scripted({ primary: new TypeError('oops'), secondary: 'unused' });

    const result = await executeWithFallback({ route, attempt });

    expect(result).toMatchObject({ ok: false, error: expect.any(TypeError) });
    expect(calls).toEqual(['primary']);
  });

  it('reports the last error when every model fails', async () => {
    const last = outage('mock');
    const { attempt } = scripted({ primary: outage(), secondary: outage(), tertiary: last });

    const result = await executeWithFallback({ route, attempt });

    expect(result).toMatchObject({ ok: false, error: last });
    expect(result.attempts).toHaveLength(3);
  });

  it('marks simulated outages in the attempt record', async () => {
    const { attempt } = scripted({ primary: simulatedOutageError('nvidia'), secondary: 'ok' });

    const result = await executeWithFallback({ route, attempt });

    expect(result.attempts[0]).toMatchObject({ simulated: true, errorCode: 'simulated_outage' });
    expect(result.attempts[1]).toMatchObject({ simulated: false, outcome: 'success' });
  });
});
