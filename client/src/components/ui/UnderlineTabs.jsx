/**
 * Underline tabs on a full-width 1px rule; the selected tab carries a 2px ink line as
 * wide as its label. Used as a filter, so each tab is a toggle button.
 */
export function UnderlineTabs({ label, tabs, value, onChange }) {
  return (
    <div
      role="group"
      aria-label={label}
      className="flex gap-6 overflow-x-auto border-b border-line"
    >
      {tabs.map((tab) => {
        const selected = tab.value === value;
        return (
          <button
            key={tab.value || 'all'}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(tab.value)}
            className={`-mb-px flex-none border-b-2 pb-2.5 text-body transition-colors duration-150 ${
              selected
                ? 'border-ink font-semibold text-ink'
                : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
