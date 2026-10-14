import React from 'react';

/**
 * StatusTabs: the one tab pattern for Pending / History style switches.
 *
 * - variant "segmented": compact joined control that fits inside a toolbar row.
 * - variant "underline": classic tabs sitting above a toolbar/table.
 * - Optional `count` per tab. Arrow keys / Home / End move between tabs.
 *
 * tabs: [{ id, label, count? }]
 */
const StatusTabs = ({
  tabs,
  activeTab,
  onChange,
  variant = 'segmented',
  label = 'Views',
  className = '',
}) => {
  const handleKeyDown = (e, index) => {
    let next = null;
    if (e.key === 'ArrowRight') next = (index + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = tabs.length - 1;
    if (next === null) return;
    e.preventDefault();
    onChange(tabs[next].id);
    const buttons = e.currentTarget.parentElement.querySelectorAll('[role="tab"]');
    buttons[next]?.focus();
  };

  const isUnderline = variant === 'underline';

  const containerClass = isUnderline
    ? 'flex w-full gap-1 border-b'
    : 'inline-flex h-9 shrink-0 items-stretch gap-0.5 rounded-md border bg-card p-0.5';

  return (
    <div role="tablist" aria-label={label} className={`${containerClass} ${className}`}>
      {tabs.map((tab, index) => {
        const isActive = activeTab === tab.id;
        const tabClass = isUnderline
          ? `-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              isActive
                ? 'border-primary text-brand-700'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`
          : `inline-flex items-center gap-2 whitespace-nowrap rounded px-3 text-sm font-medium transition-colors ${
              isActive
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
            }`;

        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(e) => handleKeyDown(e, index)}
            className={tabClass}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span className="rounded bg-secondary px-1.5 text-xs font-medium tabular-nums text-foreground">
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};

export default StatusTabs;
