import { describe, expect, it } from 'vitest';
import { niceTicks, xLabelIndices } from './scale.js';

describe('niceTicks', () => {
  it('uses round steps from zero with the top tick above the maximum', () => {
    expect(niceTicks(87)).toEqual([0, 25, 50, 75, 100]);
    expect(niceTicks(100)).toEqual([0, 25, 50, 75, 100, 125]);
  });

  it('works for fractions of a cent without floating-point noise', () => {
    const ticks = niceTicks(0.00038);
    expect(ticks.at(-1)).toBeGreaterThan(0.00038);
    expect(ticks.every((tick) => String(tick).length < 10)).toBe(true);
  });

  it('draws a scale even when every value is zero', () => {
    expect(niceTicks(0)).toEqual([0, 1, 2, 3, 4]);
  });
});

describe('xLabelIndices', () => {
  it('spaces labels on one fixed step', () => {
    const indices = xLabelIndices(25, 6);
    const steps = indices.slice(1).map((value, i) => value - indices[i]);
    expect(new Set(steps).size).toBe(1);
    expect(indices.length).toBeLessThanOrEqual(6);
  });

  it('handles tiny series', () => {
    expect(xLabelIndices(1)).toEqual([0]);
    expect(xLabelIndices(0)).toEqual([]);
  });
});
