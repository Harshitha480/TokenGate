/**
 * Every model TokenGate can route to. This is the only place model names, providers,
 * prices and fallback chains are defined; the rest of the server reads them from here.
 *
 * Fields
 *   displayName     Shown in the dashboard.
 *   provider        Key of a provider adapter in src/providers ("nvidia" or "mock").
 *   upstreamModel   The model id sent to that provider.
 *   pricing         USD per 1M tokens, used to compute costUsd for every request.
 *   timeoutMs       Optional per-model provider timeout (defaults to PROVIDER_TIMEOUT_MS).
 *   defaultParams   Request fields applied unless the client sends its own value.
 *   fallbacks       Model ids tried in order if this one fails with a retryable error.
 *                   Only the requested model's list is used (no chains of chains).
 *   mock            Mock-provider behaviour: latencyMs and failureRate (0-1).
 *
 * ┌──────────────────────────────────────────────────────────────────────────────┐
 * │ PLACEHOLDER PRICES. Update these before relying on the cost figures.         │
 * │ NVIDIA's build.nvidia.com endpoints are free for prototyping (rate limited), │
 * │ so the figures below are reference market rates from OpenRouter, checked on  │
 * │ 2026-10-22. They show what the same traffic would cost on a paid host.       │
 * └──────────────────────────────────────────────────────────────────────────────┘
 */
const models = {
  'nemotron-3-ultra': {
    displayName: 'Nemotron 3 Ultra 550B',
    provider: 'nvidia',
    upstreamModel: 'nvidia/nemotron-3-ultra-550b-a55b',
    pricing: { inputPer1M: 0.5, outputPer1M: 2.2 }, // PLACEHOLDER (OpenRouter, NVIDIA route)
    // Large reasoning model on a shared free tier: answers can take well over 30s.
    timeoutMs: 120_000,
    // Thinking multiplies output tokens; clients opt in with chat_template_kwargs.
    defaultParams: { chat_template_kwargs: { enable_thinking: false } },
    fallbacks: ['gpt-oss-20b'],
  },

  'gpt-oss-20b': {
    displayName: 'GPT-OSS 20B',
    provider: 'nvidia',
    upstreamModel: 'openai/gpt-oss-20b',
    pricing: { inputPer1M: 0.018, outputPer1M: 0.09 }, // PLACEHOLDER (OpenRouter, lowest route)
    // No timeout override: the free tier's queue sometimes stalls this model for a
    // minute, and failing over to Nemotron after the default 30s is the better answer.
    // gpt-oss always reasons first; "low" keeps short prompts from spending the
    // whole max_tokens budget on reasoning and returning no content.
    defaultParams: { reasoning_effort: 'low' },
    fallbacks: ['nemotron-3-ultra'],
  },

  // Mock models: no API key needed. Used by the test suite, the seed data, and to
  // demo fallback live in the Playground.
  'mock-fast': {
    displayName: 'Mock (fast)',
    provider: 'mock',
    upstreamModel: 'mock-fast',
    pricing: { inputPer1M: 0.15, outputPer1M: 0.6 }, // demo pricing so mock traffic shows a cost
    mock: { latencyMs: 150, failureRate: 0 },
    fallbacks: ['mock-steady'],
  },

  'mock-flaky': {
    displayName: 'Mock (fails half the time)',
    provider: 'mock',
    upstreamModel: 'mock-flaky',
    pricing: { inputPer1M: 0.15, outputPer1M: 0.6 }, // demo pricing
    mock: { latencyMs: 250, failureRate: 0.5 },
    fallbacks: ['mock-steady'],
  },

  'mock-steady': {
    displayName: 'Mock (steady backup)',
    provider: 'mock',
    upstreamModel: 'mock-steady',
    pricing: { inputPer1M: 0.3, outputPer1M: 1.2 }, // demo pricing
    mock: { latencyMs: 450, failureRate: 0 },
    fallbacks: [],
  },
};

module.exports = { models };
