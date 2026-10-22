import { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

/**
 * Built on the native <dialog>: showModal() gives a real focus trap, Escape to close
 * and an inert page behind it, with no extra code. `variant="drawer"` docks it to the
 * right edge as a detail sheet.
 */
export function Dialog({ open, onClose, title, description, children, footer, variant = 'modal' }) {
  const ref = useRef(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const placement =
    variant === 'drawer'
      ? 'ml-auto mr-0 h-dvh max-h-dvh w-full max-w-[520px] rounded-none sm:rounded-l-sheet'
      : 'm-auto w-[calc(100%-32px)] max-w-[480px] rounded-sheet';

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(event) => {
        // A click on the backdrop lands on the <dialog> element itself.
        if (event.target === ref.current) onClose();
      }}
      aria-labelledby={titleId}
      className={`${placement} border border-line bg-surface p-0 text-ink shadow-[var(--float-shadow)] backdrop:bg-[var(--overlay)]`}
    >
      {open ? (
        <div className="flex max-h-full flex-col">
          <header className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
            <div className="min-w-0">
              <h2 id={titleId} className="text-section font-semibold">
                {title}
              </h2>
              {description ? <p className="text-body text-muted">{description}</p> : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="-mr-2 grid size-8 flex-none place-items-center rounded-control text-muted hover:bg-raised hover:text-ink"
            >
              <X size={16} aria-hidden="true" />
              <span className="sr-only">Close</span>
            </button>
          </header>
          <div className="overflow-y-auto px-6 py-5">{children}</div>
          {footer ? (
            <footer className="flex justify-end gap-2 border-t border-line px-6 py-4">
              {footer}
            </footer>
          ) : null}
        </div>
      ) : null}
    </dialog>
  );
}
