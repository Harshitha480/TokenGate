/**
 * A failed call to an upstream provider. `retryable` decides whether the gateway
 * may try the next model in the fallback chain; `status` and `code` are what the
 * client sees if no fallback succeeds.
 */
class ProviderError extends Error {
  constructor({ provider, status, code, message, retryable, upstreamStatus = null, cause }) {
    super(message, { cause });
    this.name = 'ProviderError';
    this.provider = provider;
    this.status = status;
    this.code = code;
    this.retryable = retryable;
    this.upstreamStatus = upstreamStatus;
  }
}

/**
 * Maps an upstream HTTP status to a gateway error. Server-side failures (5xx, 429,
 * a rejected gateway credential) are the provider's problem, so another provider
 * may succeed; any other 4xx means the request itself is wrong and would fail
 * everywhere, so it is returned to the client instead of retried.
 */
function fromUpstreamStatus(provider, upstreamStatus, upstreamMessage) {
  const detail = upstreamMessage ? `: ${upstreamMessage}` : '';

  if (upstreamStatus === 429) {
    return new ProviderError({
      provider,
      upstreamStatus,
      status: 429,
      code: 'upstream_rate_limited',
      message: `${provider} is rate limiting requests${detail}`,
      retryable: true,
    });
  }
  if (upstreamStatus === 401 || upstreamStatus === 403) {
    return new ProviderError({
      provider,
      upstreamStatus,
      status: 502,
      code: 'upstream_auth_failed',
      message: `TokenGate's credentials for ${provider} were rejected`,
      retryable: true,
    });
  }
  if (upstreamStatus === 408 || upstreamStatus >= 500) {
    return new ProviderError({
      provider,
      upstreamStatus,
      status: 502,
      code: 'upstream_error',
      message: `${provider} returned ${upstreamStatus}${detail}`,
      retryable: true,
    });
  }
  return new ProviderError({
    provider,
    upstreamStatus,
    status: upstreamStatus,
    code: 'upstream_rejected_request',
    message: `${provider} rejected the request${detail}`,
    retryable: false,
  });
}

function timeoutError(provider, timeoutMs) {
  return new ProviderError({
    provider,
    status: 504,
    code: 'upstream_timeout',
    message: `${provider} did not respond within ${timeoutMs}ms`,
    retryable: true,
  });
}

function networkError(provider, cause) {
  return new ProviderError({
    provider,
    status: 502,
    code: 'upstream_unreachable',
    message: `Could not reach ${provider}`,
    retryable: true,
    cause,
  });
}

function notConfiguredError(provider) {
  return new ProviderError({
    provider,
    status: 503,
    code: 'provider_not_configured',
    message: `${provider} has no API key configured on this gateway`,
    retryable: true,
  });
}

module.exports = {
  ProviderError,
  fromUpstreamStatus,
  timeoutError,
  networkError,
  notConfiguredError,
};
