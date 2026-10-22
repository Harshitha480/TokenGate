import { useId } from 'react';

/**
 * A segmented control as a radio group: as wide as its options, arrow keys move the
 * selection (native radio behaviour), and the selected option is a white pill.
 */
export function Segmented({ label, options, value, onChange, className = '' }) {
  const name = useId();
  return (
    <fieldset className={`inline-flex rounded-control bg-active p-0.5 ${className}`}>
      <legend className="sr-only">{label}</legend>
      {options.map((option) => (
        <label
          key={option.value}
          className="relative cursor-pointer rounded-[5px] px-2.5 py-1 text-small font-medium text-muted transition-colors duration-150 has-checked:bg-surface has-checked:text-ink has-focus-visible:outline-2 has-focus-visible:outline-accent"
        >
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
            className="sr-only"
          />
          {option.label}
        </label>
      ))}
    </fieldset>
  );
}
