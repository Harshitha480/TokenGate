import { describe, expect, it } from 'vitest';
import {
  formatCount,
  formatLatency,
  formatPercent,
  formatUsd,
  formatUsdFixed,
  NO_VALUE,
} from './format.js';

describe('formatUsd', () => {
  it('uses cents from a cent up', () => {
    expect(formatUsd(1234.5)).toBe('$1,234.50');
    expect(formatUsd(0.42)).toBe('$0.42');
  });

  it('keeps four significant digits for fractions of a cent', () => {
    expect(formatUsd(0.000382916)).toBe('$0.0003829');
    expect(formatUsd(0.00001)).toBe('$0.00001');
  });

  it('never falls into exponent notation', () => {
    expect(formatUsd(1e-9)).toBe('<$0.000001');
  });

  it('prints a real zero and a dash for missing values', () => {
    expect(formatUsd(0)).toBe('$0.00');
    expect(formatUsd(null)).toBe(NO_VALUE);
  });

  it('aligns table costs to six decimals', () => {
    expect(formatUsdFixed(0.0000672)).toBe('$0.000067');
  });
});

describe('other figures', () => {
  it('formats latency in ms, then seconds', () => {
    expect(formatLatency(842)).toBe('842 ms');
    expect(formatLatency(2804)).toBe('2.80 s');
    expect(formatLatency(60004)).toBe('60.0 s');
    expect(formatLatency(undefined)).toBe(NO_VALUE);
  });

  it('formats rates and counts', () => {
    expect(formatPercent(0.712)).toBe('71.2%');
    expect(formatPercent(null)).toBe(NO_VALUE);
    expect(formatCount(12500)).toBe('12,500');
  });
});
