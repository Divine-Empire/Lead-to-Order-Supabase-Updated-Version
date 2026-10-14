import React from 'react';

const TONES = {
  success: { badge: 'bg-success/10 text-success border-success/25', dot: 'bg-success' },
  warning: { badge: 'bg-warning/15 text-warning-foreground border-warning/30', dot: 'bg-warning' },
  danger: { badge: 'bg-destructive/10 text-destructive border-destructive/25', dot: 'bg-destructive' },
  info: { badge: 'bg-info/10 text-info border-info/25', dot: 'bg-info' },
  neutral: { badge: 'bg-secondary text-muted-foreground border-border', dot: 'bg-muted-foreground' },
};

/**
 * One status pattern for the whole app: tinted background, a dot and the status text.
 * The text always carries the meaning, so colour is never the only signal.
 *
 * tone: 'success' | 'warning' | 'danger' | 'info' | 'neutral'
 */
const StatusBadge = ({ tone = 'neutral', children, className = '' }) => {
  const t = TONES[tone] || TONES.neutral;
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded border px-2 py-0.5 text-xs font-medium ${t.badge} ${className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${t.dot}`} aria-hidden="true" />
      {children}
    </span>
  );
};

export default StatusBadge;
