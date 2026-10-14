import React from 'react';
import { CheckCircle2, AlertCircle, HelpCircle } from 'lucide-react';
import useDialogBehavior from './useDialogBehavior';

/**
 * ModalAlert: success / error messages and action confirmations.
 *
 * @param {boolean} isOpen - Controls visibility.
 * @param {string} type - 'success', 'error', or 'confirm'.
 * @param {string} title - Main heading.
 * @param {string} message - Description text.
 * @param {Function} onConfirm - Action for the 'Confirm' button (type 'confirm').
 * @param {Function} onClose - Action for 'Cancel' / 'OK' (also Esc).
 * @param {string} confirmText - Label of the confirm button (default 'Confirm').
 * @param {boolean} destructive - Styles the confirm button as destructive.
 */
const TYPES = {
  success: { icon: CheckCircle2, chip: 'bg-success/10 text-success' },
  error: { icon: AlertCircle, chip: 'bg-destructive/10 text-destructive' },
  confirm: { icon: HelpCircle, chip: 'bg-warning/15 text-warning-foreground' },
};

const ModalAlertInner = ({ type = 'success', title, message, onConfirm, onClose, confirmText = 'Confirm', destructive = false }) => {
  const dialogRef = useDialogBehavior(onClose);
  const titleId = React.useId();
  const descId = React.useId();
  const { icon: Icon, chip } = TYPES[type] || TYPES.success;

  const confirmClass = destructive
    ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
    : 'bg-primary text-primary-foreground hover:bg-primary/90';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1000] p-4 animate-in fade-in duration-200">
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="bg-card rounded-lg p-6 w-full max-w-sm shadow-lg border animate-in zoom-in-95 duration-200 flex flex-col items-center text-center"
      >
        <span className={`mb-4 flex h-12 w-12 items-center justify-center rounded-lg ${chip}`}>
          <Icon size={24} aria-hidden="true" />
        </span>

        <h3 id={titleId} className="text-lg font-semibold text-foreground mb-1">{title}</h3>
        <p id={descId} className="text-sm text-muted-foreground mb-6 max-h-[50vh] w-full overflow-y-auto whitespace-pre-line break-words" tabIndex={0}>
          {message}
        </p>

        <div className="flex gap-3 w-full">
          {type === 'confirm' ? (
            <>
              <button
                type="button"
                onClick={onClose}
                className="h-9 flex-1 rounded-md border border-input bg-card text-sm font-medium text-foreground transition-colors hover:bg-accent"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onConfirm();
                  onClose();
                }}
                className={`h-9 flex-1 rounded-md text-sm font-medium transition-colors ${confirmClass}`}
              >
                {confirmText}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="h-9 w-full rounded-md bg-primary text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              OK
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

const ModalAlert = (props) => (props.isOpen ? <ModalAlertInner {...props} /> : null);

export default ModalAlert;
