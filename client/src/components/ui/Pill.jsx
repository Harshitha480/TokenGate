const TONES = {
  positive: 'bg-[var(--pill-positive-bg)] text-[var(--pill-positive-ink)]',
  negative: 'bg-[var(--pill-negative-bg)] text-[var(--pill-negative-ink)]',
  warning: 'bg-[var(--pill-warning-bg)] text-[var(--pill-warning-ink)]',
  neutral: 'bg-[var(--pill-neutral-bg)] text-[var(--pill-neutral-ink)]',
  accent: 'bg-[var(--pill-accent-bg)] text-[var(--pill-accent-ink)]',
};

/** A pale tint with dark text of the same hue. Never squeezed by its column. */
export function Pill({ tone = 'neutral', children, className = '' }) {
  return (
    <span
      className={`inline-flex h-5 flex-none items-center whitespace-nowrap rounded px-1.5 text-small font-medium ${TONES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
