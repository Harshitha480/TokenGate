import { describe, expect, it } from 'vitest';
import { deltaFor, findingFor } from './insights.js';

describe('deltaFor', () => {
  const range = '24h';

  it('colours by whether the move is good, not by its direction', () => {
    expect(deltaFor(120, 100, { polarity: 'down-good', range })).toEqual({
      text: '+20% vs prior 24h',
      tone: 'negative',
    });
    expect(deltaFor(80, 100, { polarity: 'down-good', range }).tone).toBe('positive');
    expect(deltaFor(120, 100, { polarity: 'up-good', range }).tone).toBe('positive');
    expect(deltaFor(120, 100, { polarity: 'neutral', range }).tone).toBe('muted');
  });

  it('reports rates in percentage points', () => {
    expect(deltaFor(0.05, 0.02, { polarity: 'down-good', kind: 'points', range }).text).toBe(
      '+3.0 pts vs prior 24h',
    );
  });

  it('never invents a change when there is nothing to compare against', () => {
    expect(
      deltaFor(50, 0, { polarity: 'neutral', range, key: 'requests', priorRequests: 0 }),
    ).toEqual({ text: '+50 (new) vs prior 24h', tone: 'muted' });
    expect(deltaFor(0.3, null, { polarity: 'up-good', range, priorRequests: 0 }).text).toBe('—');
    expect(deltaFor(100, 100, { polarity: 'down-good', range }).text).toBe(
      'No change vs prior 24h',
    );
  });
});

describe('findingFor', () => {
  const base = {
    requests: 200,
    errorCount: 2,
    errorRate: 0.01,
    fallbackCount: 0,
    savedUsd: 0,
    costUsd: 0.5,
  };

  it('leads with failures when they are high', () => {
    expect(findingFor({ ...base, errorCount: 20, errorRate: 0.1 }, '7d')).toBe(
      '10.0% of requests failed in the last 7 days (20 of 200).',
    );
  });

  it('then fallbacks, then savings, then cost', () => {
    expect(findingFor({ ...base, fallbackCount: 4 }, '24h')).toMatch(/^4 of 200 requests/);
    expect(findingFor({ ...base, savedUsd: 0.25 }, '24h')).toMatch(/^The cache saved \$0\.25/);
    expect(findingFor(base, '24h')).toBe('200 requests cost $0.50 in the last 24 hours.');
  });

  it('invites a first request when there is no traffic', () => {
    expect(findingFor({ ...base, requests: 0 }, '30d')).toMatch(/^No requests in the last 30 days/);
  });
});
