const { ProviderError } = require('../../providers/providerError');

/**
 * Whether a failed attempt may move on to the next model. Only provider-side
 * failures qualify; a rejected request (4xx) would fail on every provider, and a
 * client that hung up wants nothing more.
 */
function shouldFallBack(error, signal) {
  return !signal?.aborted && error instanceof ProviderError && error.retryable;
}

/**
 * Tries each model in `route` in order until one succeeds.
 *
 * @param {{
 *   route: Array<{ id: string, provider: string }>,
 *   attempt: (model, index: number) => Promise<any>,
 *   signal?: AbortSignal,
 *   onFallback?: (event: { from, to, error }) => void,
 * }} options
 * @returns {Promise<
 *   | { ok: true, value: any, model: object, attempts: object[] }
 *   | { ok: false, error: Error, attempts: object[] }
 * >}
 */
async function executeWithFallback({ route, attempt, signal, onFallback }) {
  const attempts = [];
  let lastError = null;

  for (const [index, model] of route.entries()) {
    const startedAt = performance.now();
    const recordAttempt = (error) =>
      attempts.push({
        model: model.id,
        provider: model.provider,
        outcome: error ? 'error' : 'success',
        errorCode: error ? (error.code ?? 'internal_error') : null,
        latencyMs: Math.round(performance.now() - startedAt),
        simulated: error?.code === 'simulated_outage',
      });

    try {
      const value = await attempt(model, index);
      recordAttempt(null);
      return { ok: true, value, model, attempts };
    } catch (error) {
      lastError = error;
      recordAttempt(error);

      const next = route[index + 1];
      if (!next || !shouldFallBack(error, signal)) break;
      onFallback?.({ from: model, to: next, error });
    }
  }

  return { ok: false, error: lastError, attempts };
}

module.exports = { executeWithFallback, shouldFallBack };
