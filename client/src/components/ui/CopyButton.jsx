import { useEffect, useState } from 'react';
import { Check, Copy } from 'lucide-react';

/** Copies `value`; the label changes to "Copied" and is announced to screen readers. */
export function CopyButton({ value, label = 'Copy', className = '' }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return undefined;
    const timer = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      // Clipboard can be blocked (insecure origin); the value stays selectable.
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className={`inline-flex h-7 flex-none items-center gap-1.5 rounded-control px-2 text-small font-medium text-muted hover:bg-raised hover:text-ink ${className}`}
    >
      {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
      <span aria-live="polite">{copied ? 'Copied' : label}</span>
    </button>
  );
}
