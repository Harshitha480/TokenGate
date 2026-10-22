/**
 * A ranking as a list: label and value on one line, a bar at the true ratio of the
 * largest value under it. One colour for every bar; the values are written out, so
 * the bars never carry information that is not also readable as text.
 *
 * @param {{ rows: Array<{ key: string, label: string, value: number, display: string, detail?: string }> }} props
 */
export function BarList({ rows, label }) {
  const max = Math.max(0, ...rows.map((row) => row.value));
  return (
    <ul aria-label={label} className="flex flex-col gap-4">
      {rows.map((row) => {
        const share = max > 0 ? row.value / max : 0;
        return (
          <li key={row.key}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="truncate text-body text-ink">{row.label}</span>
              <span className="num flex-none text-body text-ink">{row.display}</span>
            </div>
            <div className="mt-1.5 h-2" aria-hidden="true">
              {share > 0 ? (
                <div
                  className="h-2 rounded-r bg-chart-1"
                  style={{ width: `${Math.max(share * 100, 1.5)}%` }}
                />
              ) : null}
            </div>
            {row.detail ? <p className="num mt-1 text-small text-muted">{row.detail}</p> : null}
          </li>
        );
      })}
    </ul>
  );
}
