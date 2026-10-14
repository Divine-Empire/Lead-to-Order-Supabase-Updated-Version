import React from 'react';
import { XCircle, Save } from 'lucide-react';
import StatusTabs from './StatusTabs';

/**
 * TabSwitcher: Pending/History switch. Delegates to the shared StatusTabs.
 */
export const TabSwitcher = ({ activeTab, onTabChange, tabs }) => (
  <StatusTabs tabs={tabs} activeTab={activeTab} onChange={onTabChange} variant="segmented" />
);

/**
 * FormActionButtons: standard Cancel (secondary) + Save (primary) pair.
 */
export const FormActionButtons = ({
  onCancel,
  onSubmit,
  cancelText = 'Cancel',
  submitText = 'Save Changes',
  loading = false,
  className = "",
  formId = null,
  extraButton = null
}) => {
  return (
    <div className={`flex gap-3 items-center ${className}`}>
      <button
        type="button"
        onClick={onCancel}
        className="flex h-9 flex-1 items-center justify-center gap-2 rounded-md border border-input bg-card px-2 text-sm font-medium text-foreground transition-colors hover:bg-accent md:px-4"
        title={cancelText}
      >
        <XCircle size={16} aria-hidden="true" />
        <span className="hidden sm:inline">{cancelText}</span>
      </button>

      {extraButton && (
        <div className="flex-1 flex w-full justify-center">
          {extraButton}
        </div>
      )}

      <button
        type={onSubmit ? "button" : "submit"}
        form={formId}
        onClick={onSubmit}
        disabled={loading}
        className="flex h-9 flex-[1.5] items-center justify-center gap-2 rounded-md bg-primary px-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        title={submitText}
      >
        {loading ? (
          <>
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" aria-hidden="true" />
            <span className="hidden sm:inline">Processing...</span>
          </>
        ) : (
          <>
            <Save size={16} aria-hidden="true" />
            <span className="hidden sm:inline">{submitText}</span>
          </>
        )}
      </button>
    </div>
  );
};
