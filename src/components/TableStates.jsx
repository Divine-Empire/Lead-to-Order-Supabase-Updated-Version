import React from 'react';
import { AlertCircle, Inbox } from 'lucide-react';

/** Nothing to show yet, or nothing matches the filters. Offer the next step via `action`. */
export const EmptyState = ({ title, description, action }) => (
  <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
    <Inbox className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
    <p className="text-sm font-medium text-foreground">{title}</p>
    {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
    {action && <div className="mt-2">{action}</div>}
  </div>
);

/** A load failed. Say what happened and let the user retry. */
export const ErrorState = ({ message, onRetry }) => (
  <div role="alert" className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
    <AlertCircle className="h-8 w-8 text-destructive" aria-hidden="true" />
    <p className="text-sm font-medium text-foreground">Couldn't load data</p>
    {message && <p className="max-w-md text-sm text-muted-foreground">{message}</p>}
    {onRetry && (
      <button
        type="button"
        onClick={onRetry}
        className="mt-2 h-8 rounded-md border border-input bg-card px-3 text-sm font-medium text-foreground transition-colors hover:bg-accent"
      >
        Try again
      </button>
    )}
  </div>
);
