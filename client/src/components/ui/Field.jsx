import { useId } from 'react';

const CONTROL =
  'w-full rounded-control border border-control bg-surface px-3 text-body text-ink placeholder:text-faint ' +
  'aria-[invalid=true]:border-negative disabled:opacity-60';

/**
 * A labelled form control. The label sits above the control, help and errors sit
 * directly under it, and both are wired up with aria-describedby.
 */
export function Field({ label, hint, error, children, className = '' }) {
  const id = useId();
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ');
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={id} className="text-body font-medium text-ink">
        {label}
      </label>
      {children({
        id,
        'aria-describedby': describedBy || undefined,
        'aria-invalid': Boolean(error),
      })}
      {hint && !error ? (
        <p id={`${id}-hint`} className="text-small text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="text-small text-negative" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function TextInput({ className = '', ...props }) {
  return <input className={`${CONTROL} h-9 ${className}`} {...props} />;
}

export function Select({ className = '', children, ...props }) {
  return (
    <select className={`${CONTROL} h-9 pr-8 ${className}`} {...props}>
      {children}
    </select>
  );
}

export function TextArea({ className = '', ...props }) {
  return (
    <textarea className={`${CONTROL} min-h-28 resize-y py-2 leading-5 ${className}`} {...props} />
  );
}

/** A switch: a checkbox with role="switch", so it is announced as on/off. */
export function Switch({ checked, onChange, label, description, disabled = false }) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <label htmlFor={id} className="text-body font-medium text-ink">
          {label}
        </label>
        {description ? (
          <p id={`${id}-description`} className="text-small text-muted">
            {description}
          </p>
        ) : null}
      </div>
      <input
        id={id}
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        aria-describedby={description ? `${id}-description` : undefined}
        onChange={(event) => onChange(event.target.checked)}
        className="peer relative mt-0.5 h-4 w-7 flex-none cursor-pointer appearance-none rounded-full bg-control transition-colors duration-150 checked:bg-accent disabled:cursor-not-allowed disabled:opacity-50 before:absolute before:top-0.5 before:left-0.5 before:size-3 before:rounded-full before:bg-white before:transition-transform before:duration-150 checked:before:translate-x-3"
      />
    </div>
  );
}
