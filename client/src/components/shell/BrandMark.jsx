/** TokenGate's mark: a gate (two posts and a lintel) with a token passing through. */
export function BrandMark({ size = 20, className = '' }) {
  return (
    <svg
      viewBox="0 0 20 20"
      width={size}
      height={size}
      aria-hidden="true"
      className={`flex-none text-accent ${className}`}
    >
      <rect x="2" y="3" width="3" height="15" rx="1" fill="currentColor" />
      <rect x="15" y="3" width="3" height="15" rx="1" fill="currentColor" />
      <rect x="2" y="3" width="16" height="3" rx="1" fill="currentColor" />
      <circle cx="10" cy="12.5" r="2.5" fill="currentColor" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="flex items-center gap-2 text-section font-semibold text-ink">
      <BrandMark />
      TokenGate
    </span>
  );
}
