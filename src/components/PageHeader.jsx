import React from 'react';

/**
 * In-page heading for sections inside a page (the global page title lives in MainNav).
 * Keep to one primary action in `actions`; the rest secondary/ghost.
 */
const PageHeader = ({ title, description, actions, className = '' }) => (
  <div className={`flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between ${className}`}>
    <div className="min-w-0">
      <h2 className="text-lg font-semibold leading-7 tracking-tight text-foreground">{title}</h2>
      {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
  </div>
);

export default PageHeader;
