/**
 * A card on the sheet: 1px edge, no shadow. The header carries the block's title, an
 * optional one-line description and an action or legend on the right.
 */
export function Panel({
  title,
  description,
  action,
  children,
  className = '',
  bodyClassName = '',
}) {
  return (
    <section
      className={`flex min-w-0 flex-col rounded-card border border-line bg-surface ${className}`}
    >
      {title ? (
        <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-5 pt-4">
          <div className="min-w-0">
            <h2 className="text-section font-semibold text-ink">{title}</h2>
            {description ? <p className="text-small text-muted">{description}</p> : null}
          </div>
          {action ? <div className="flex flex-none items-center gap-2">{action}</div> : null}
        </header>
      ) : null}
      <div className={`flex-1 px-5 pt-3 pb-5 ${bodyClassName}`}>{children}</div>
    </section>
  );
}
