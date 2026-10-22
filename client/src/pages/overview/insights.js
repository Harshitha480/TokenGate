import {
  formatCount,
  formatPercent,
  formatUsd,
  RANGE_LABELS,
  RANGE_SHORT,
} from '../../lib/format.js';

/**
 * The one sentence under the title: the fact in this range that most needs
 * attention, worst first (failures, then fallbacks, then cost).
 */
export function findingFor(summary, range) {
  const period = RANGE_LABELS[range];
  if (!summary || summary.requests === 0) {
    return `No requests in the ${period}. Send one from the Playground to see it here.`;
  }
  if (summary.errorRate >= 0.05) {
    return `${formatPercent(summary.errorRate)} of requests failed in the ${period} (${formatCount(
      summary.errorCount,
    )} of ${formatCount(summary.requests)}).`;
  }
  if (summary.fallbackCount > 0) {
    return `${formatCount(summary.fallbackCount)} of ${formatCount(
      summary.requests,
    )} requests were answered by a fallback model in the ${period}.`;
  }
  if (summary.savedUsd > 0) {
    return `The cache saved ${formatUsd(summary.savedUsd)} on top of ${formatUsd(
      summary.costUsd,
    )} spent in the ${period}.`;
  }
  return `${formatCount(summary.requests)} requests cost ${formatUsd(summary.costUsd)} in the ${period}.`;
}

/**
 * The change against the previous period, coloured by whether the move is good or
 * bad for this metric (not by up or down), grey when nothing comparable exists.
 *
 * @param {'up-good' | 'down-good' | 'neutral'} polarity
 * @param {'relative' | 'points'} kind  relative % change, or percentage points for rates
 */
export function deltaFor(
  current,
  previous,
  { polarity, kind = 'relative', range, key, priorRequests },
) {
  const against = `vs prior ${RANGE_SHORT[range]}`;
  if (current === null || current === undefined) return { text: '—', tone: 'muted' };
  // With no traffic before, only the request count has a meaningful comparison.
  if (priorRequests === 0) {
    return key === 'requests' && current > 0
      ? { text: `+${formatCount(current)} (new) ${against}`, tone: 'muted' }
      : { text: '—', tone: 'muted' };
  }
  if (previous === null || previous === undefined || (kind === 'relative' && previous === 0)) {
    return current > 0 ? { text: `New ${against}`, tone: 'muted' } : { text: '—', tone: 'muted' };
  }

  const change = kind === 'points' ? (current - previous) * 100 : (current - previous) / previous;
  if (Math.abs(change) < (kind === 'points' ? 0.05 : 0.0005)) {
    return { text: `No change ${against}`, tone: 'muted' };
  }

  const sign = change > 0 ? '+' : '−';
  const amount =
    kind === 'points'
      ? `${sign}${Math.abs(change).toFixed(1)} pts`
      : `${sign}${Math.abs(change * 100).toFixed(Math.abs(change) < 0.1 ? 1 : 0)}%`;
  const better = polarity === 'up-good' ? change > 0 : change < 0;
  const tone = polarity === 'neutral' ? 'muted' : better ? 'positive' : 'negative';
  return { text: `${amount} ${against}`, tone };
}
