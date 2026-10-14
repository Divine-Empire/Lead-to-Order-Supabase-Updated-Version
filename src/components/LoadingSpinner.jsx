import React from 'react';
import { Loader2 } from 'lucide-react';

/**
 * Reusable loading indicator.
 *
 * @param {string} message - Text shown next to the spinner.
 * @param {boolean} fullPage - If true, covers the whole screen with a light overlay.
 * @param {string} minHeight - Minimum height of the inline container (default: '450px').
 */
const LoadingSpinner = ({ message = 'Loading data...', fullPage = false, minHeight = '450px' }) => {
  const containerClasses = fullPage
    ? "fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-background/80 backdrop-blur-sm"
    : "flex w-full flex-col items-center justify-center gap-3 py-12";

  return (
    <div
      className={containerClasses}
      style={fullPage ? undefined : { minHeight }}
      role="status"
      aria-live="polite"
    >
      <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
      <span className="text-sm font-medium text-muted-foreground">{message}</span>
    </div>
  );
};

export default LoadingSpinner;
