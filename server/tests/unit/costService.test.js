const { calculateCostUsd } = require('../../src/services/costService');

describe('calculateCostUsd', () => {
  const pricing = { inputPer1M: 0.5, outputPer1M: 2.2 };

  it('charges input and output tokens at their own per-million rates', () => {
    expect(calculateCostUsd(pricing, { promptTokens: 1_000_000, completionTokens: 0 })).toBe(0.5);
    expect(calculateCostUsd(pricing, { promptTokens: 0, completionTokens: 1_000_000 })).toBe(2.2);
    expect(calculateCostUsd(pricing, { promptTokens: 1200, completionTokens: 350 })).toBeCloseTo(
      (1200 * 0.5 + 350 * 2.2) / 1_000_000,
      12,
    );
  });

  it('is zero when no tokens were used or the model is free', () => {
    expect(calculateCostUsd(pricing, { promptTokens: 0, completionTokens: 0 })).toBe(0);
    expect(
      calculateCostUsd(
        { inputPer1M: 0, outputPer1M: 0 },
        { promptTokens: 500, completionTokens: 500 },
      ),
    ).toBe(0);
  });

  it('rounds away floating-point noise at nano-dollar precision', () => {
    const cost = calculateCostUsd(
      { inputPer1M: 0.1, outputPer1M: 0.2 },
      { promptTokens: 1, completionTokens: 1 },
    );

    expect(cost).toBe(0.0000003);
    expect(String(cost)).not.toMatch(/0000000001|9999999/);
  });
});
