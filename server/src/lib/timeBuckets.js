const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Dashboard ranges and the bucket size each one is charted with. */
const RANGES = Object.freeze({
  '24h': { spanMs: DAY_MS, unit: 'hour', binSize: 1 },
  '7d': { spanMs: 7 * DAY_MS, unit: 'hour', binSize: 6 },
  '30d': { spanMs: 30 * DAY_MS, unit: 'day', binSize: 1 },
});

function isValidTimeZone(timeZone) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** How far `timeZone`'s wall clock is ahead of UTC at `date`, in ms. */
function timeZoneOffsetMs(date, timeZone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  const wallClockAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return wallClockAsUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/**
 * Start of the bucket containing `date`, matching MongoDB's $dateTrunc for the same
 * unit, binSize and timezone (hours are binned from local midnight).
 */
function bucketStart(date, { unit, binSize, timeZone }) {
  const offset = timeZoneOffsetMs(date, timeZone);
  const wallClock = new Date(date.getTime() + offset);
  if (unit === 'hour') {
    const hour = wallClock.getUTCHours();
    wallClock.setUTCHours(hour - (hour % binSize), 0, 0, 0);
  } else {
    wallClock.setUTCHours(0, 0, 0, 0);
  }
  // The offset can differ at the bucket start (DST), so convert back with its own offset.
  const approximate = new Date(wallClock.getTime() - offset);
  return new Date(wallClock.getTime() - timeZoneOffsetMs(approximate, timeZone));
}

/** Every bucket start from the one containing `from` up to (not including) `to`. */
function listBucketStarts(from, to, spec) {
  const starts = [];
  let start = bucketStart(from, spec);
  while (start < to) {
    starts.push(start);
    // For days, overshoot by two hours before re-aligning so 23- and 25-hour DST
    // days still land on the next local midnight.
    const step = spec.unit === 'hour' ? spec.binSize * HOUR_MS : DAY_MS + 2 * HOUR_MS;
    start = bucketStart(new Date(start.getTime() + step), spec);
  }
  return starts;
}

/** The window a range covers, ending now, and the window just before it. */
function resolveRange(range, now = new Date()) {
  const spec = RANGES[range];
  const to = now;
  const from = new Date(now.getTime() - spec.spanMs);
  const previousFrom = new Date(from.getTime() - spec.spanMs);
  return { range, from, to, previousFrom, unit: spec.unit, binSize: spec.binSize };
}

module.exports = {
  RANGES,
  isValidTimeZone,
  timeZoneOffsetMs,
  bucketStart,
  listBucketStarts,
  resolveRange,
};
