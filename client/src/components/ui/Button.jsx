import { Link } from 'react-router';

const VARIANTS = {
  // Near-black fill: the one primary action on a screen.
  primary: 'bg-primary text-on-primary hover:opacity-90',
  secondary: 'border border-control bg-surface text-ink hover:bg-raised',
  ghost: 'text-ink hover:bg-raised',
  danger: 'bg-negative text-white hover:opacity-90',
};

const SIZES = {
  md: 'h-8 px-3 text-body',
  sm: 'h-7 px-2.5 text-small',
};

function buttonClasses({ variant = 'secondary', size = 'md', className = '' } = {}) {
  return [
    'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-control font-medium',
    'transition-[background-color,opacity] duration-150 disabled:opacity-50',
    VARIANTS[variant],
    SIZES[size],
    className,
  ].join(' ');
}

export function Button({ variant, size, className, type = 'button', ...props }) {
  return <button type={type} className={buttonClasses({ variant, size, className })} {...props} />;
}

export function LinkButton({ variant, size, className, ...props }) {
  return <Link className={buttonClasses({ variant, size, className })} {...props} />;
}

/** A text action inside rows and panel headers: ink, underlined on hover. */
export function TextButton({ className = '', type = 'button', ...props }) {
  return (
    <button
      type={type}
      className={`inline-flex items-center gap-1 text-body font-medium text-ink underline-offset-4 hover:underline disabled:opacity-50 ${className}`}
      {...props}
    />
  );
}
