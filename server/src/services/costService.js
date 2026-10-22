const TOKENS_PER_PRICING_UNIT = 1_000_000;
// Nano-dollar precision: far below anything displayed, but it stops floating-point
// noise (0.30000000000000004) from accumulating across thousands of summed rows.
const COST_PRECISION = 1e9;

/**
 * Cost in USD of a request, from the token counts the provider reported and the
 * model's per-million-token prices.
 *
 * @param {{ inputPer1M: number, outputPer1M: number }} pricing
 * @param {{ promptTokens: number, completionTokens: number }} usage
 */
function calculateCostUsd(pricing, { promptTokens, completionTokens }) {
  const cost =
    (promptTokens * pricing.inputPer1M + completionTokens * pricing.outputPer1M) /
    TOKENS_PER_PRICING_UNIT;
  return Math.round(cost * COST_PRECISION) / COST_PRECISION;
}

module.exports = { calculateCostUsd };
