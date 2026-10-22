const {
  bucketStart,
  listBucketStarts,
  resolveRange,
  isValidTimeZone,
  timeZoneOffsetMs,
} = require('../../src/lib/timeBuckets');

const at = (iso) => new Date(iso);
const iso = (date) => date.toISOString();

describe('time buckets', () => {
  it('resolves a range ending now plus the period before it', () => {
    const now = at('2026-10-22T12:00:00Z');

    const range = resolveRange('7d', now);

    expect(iso(range.from)).toBe('2026-10-15T12:00:00.000Z');
    expect(iso(range.previousFrom)).toBe('2026-10-08T12:00:00.000Z');
    expect(range).toMatchObject({ unit: 'hour', binSize: 6 });
  });

  it('aligns hour buckets to the local hour, including half-hour offsets', () => {
    const date = at('2026-10-22T10:47:12Z');

    expect(iso(bucketStart(date, { unit: 'hour', binSize: 1, timeZone: 'UTC' }))).toBe(
      '2026-10-22T10:00:00.000Z',
    );
    // India is UTC+5:30, so its hours start at :30 past the UTC hour.
    expect(iso(bucketStart(date, { unit: 'hour', binSize: 1, timeZone: 'Asia/Kolkata' }))).toBe(
      '2026-10-22T10:30:00.000Z',
    );
  });

  it('bins multi-hour buckets from local midnight', () => {
    const spec = { unit: 'hour', binSize: 6, timeZone: 'UTC' };

    expect(iso(bucketStart(at('2026-10-22T05:59:00Z'), spec))).toBe('2026-10-22T00:00:00.000Z');
    expect(iso(bucketStart(at('2026-10-22T13:00:00Z'), spec))).toBe('2026-10-22T12:00:00.000Z');
  });

  it('aligns day buckets to local midnight', () => {
    const spec = { unit: 'day', binSize: 1, timeZone: 'Asia/Kolkata' };

    // 2026-10-22 03:00 IST is still the 22nd locally; midnight IST is 18:30Z the day before.
    expect(iso(bucketStart(at('2026-10-21T21:30:00Z'), spec))).toBe('2026-10-21T18:30:00.000Z');
  });

  it('lists every bucket in a range, partial first bucket included', () => {
    const spec = { unit: 'hour', binSize: 1, timeZone: 'UTC' };

    const unaligned = listBucketStarts(
      at('2026-10-21T10:30:00Z'),
      at('2026-10-22T10:30:00Z'),
      spec,
    );
    const aligned = listBucketStarts(at('2026-10-21T10:00:00Z'), at('2026-10-22T10:00:00Z'), spec);

    expect(unaligned).toHaveLength(25);
    expect(iso(unaligned[0])).toBe('2026-10-21T10:00:00.000Z');
    expect(aligned).toHaveLength(24);
  });

  it('steps day buckets correctly across a daylight-saving change', () => {
    // US clocks spring forward on 2026-03-08, so that local day is 23 hours long.
    const starts = listBucketStarts(at('2026-03-07T12:00:00Z'), at('2026-03-10T12:00:00Z'), {
      unit: 'day',
      binSize: 1,
      timeZone: 'America/New_York',
    });

    expect(starts.map(iso)).toEqual([
      '2026-03-07T05:00:00.000Z',
      '2026-03-08T05:00:00.000Z',
      '2026-03-09T04:00:00.000Z',
      '2026-03-10T04:00:00.000Z',
    ]);
  });

  it('reads offsets and validates zone names', () => {
    expect(timeZoneOffsetMs(at('2026-10-22T00:00:00Z'), 'Asia/Kolkata')).toBe(330 * 60 * 1000);
    expect(isValidTimeZone('Europe/Berlin')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus_Mons')).toBe(false);
  });
});
