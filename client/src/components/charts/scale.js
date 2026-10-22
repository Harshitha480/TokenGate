const NICE_STEPS = [1, 2, 2.5, 5, 10];

/**
 * Round, even y-axis ticks from zero, with the top tick strictly above the maximum
 * so the line never touches the plot's top edge. Works for counts, milliseconds and
 * fractions of a cent alike.
 */
export function niceTicks(maxValue, targetCount = 4) {
  const max = Number.isFinite(maxValue) && maxValue > 0 ? maxValue : 0;
  if (max === 0) return [0, 1, 2, 3, 4];

  const rough = max / targetCount;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const multiplier = NICE_STEPS.find((step) => step * magnitude >= rough) ?? 10;
  const step = Number((multiplier * magnitude).toPrecision(12));

  let top = Math.ceil(max / step) * step;
  if (top <= max) top += step;

  const ticks = [];
  for (let value = 0; value <= top + step / 2; value += step) {
    ticks.push(Number(value.toPrecision(12)));
  }
  return ticks;
}

/** Indices for 4-7 x labels on one fixed step, so the gaps between them are equal. */
export function xLabelIndices(count, maxLabels = 6) {
  if (count <= 1) return count === 1 ? [0] : [];
  const step = Math.max(1, Math.ceil((count - 1) / (maxLabels - 1)));
  const indices = [];
  for (let index = 0; index < count; index += step) indices.push(index);
  return indices;
}
