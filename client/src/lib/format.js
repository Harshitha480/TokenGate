// Figures follow one rule each: separators everywhere, fixed decimals per metric,
// a sign on every change, and an em dash (never a fake zero) for "no data".
export const NO_VALUE = '—';

const isMissing = (value) => value === null || value === undefined || Number.isNaN(value);

const integer = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

export function formatCount(value) {
  return isMissing(value) ? NO_VALUE : integer.format(value);
}

/**
 * LLM requests cost fractions of a cent, so money needs more places than usual:
 * two decimals from a cent up, otherwise four significant digits ($0.000383).
 */
export function formatUsd(value) {
  if (isMissing(value)) return NO_VALUE;
  if (value === 0) return '$0.00';
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 0.01) {
    return `${sign}$${abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  // toPrecision switches to exponent notation below 1e-6.
  if (abs < 0.000001) return `${sign}<$0.000001`;
  return `${sign}$${abs.toPrecision(4).replace(/0+$/, '').replace(/\.$/, '')}`;
}

/** Fixed six decimals so a column of per-request costs lines up digit for digit. */
export function formatUsdFixed(value) {
  if (isMissing(value)) return NO_VALUE;
  return `$${value.toFixed(6)}`;
}

export function formatPercent(ratio, digits = 1) {
  if (isMissing(ratio)) return NO_VALUE;
  return `${(ratio * 100).toFixed(digits)}%`;
}

export function formatLatency(ms) {
  if (isMissing(ms)) return NO_VALUE;
  if (ms >= 10_000) return `${(ms / 1000).toFixed(1)} s`;
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)} s`;
  return `${integer.format(ms)} ms`;
}

export function formatTokens(value) {
  if (isMissing(value)) return NO_VALUE;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 10_000) return `${(value / 1000).toFixed(1)}k`;
  return integer.format(value);
}

const timeFormat = new Intl.DateTimeFormat('en-US', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});
const dateFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
const dateTimeFormat = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

export const formatTime = (date) => timeFormat.format(new Date(date));
export const formatDay = (date) => dateFormat.format(new Date(date));
export const formatDateTime = (date) => dateTimeFormat.format(new Date(date));

/** "Today 14:02", "Yesterday 09:15" or "Oct 18 22:40": recency in words where it helps. */
export function formatWhen(date, now = new Date()) {
  const value = new Date(date);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday.getTime() - 86_400_000);
  if (value >= startOfToday) return `Today ${formatTime(value)}`;
  if (value >= startOfYesterday) return `Yesterday ${formatTime(value)}`;
  return `${formatDay(value)} ${formatTime(value)}`;
}

export function formatRelative(date, now = new Date()) {
  if (!date) return 'Never';
  const seconds = Math.round((now.getTime() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)} h ago`;
  return `${Math.floor(seconds / 86_400)} days ago`;
}

export const RANGE_LABELS = { '24h': 'last 24 hours', '7d': 'last 7 days', '30d': 'last 30 days' };
export const RANGE_SHORT = { '24h': '24h', '7d': '7 days', '30d': '30 days' };
