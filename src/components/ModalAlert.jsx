import React from 'react';
import { CheckCircle2, AlertCircle, AlertTriangle, HelpCircle } from 'lucide-react';
import useDialogBehavior from './useDialogBehavior';

/**
 * ModalAlert: success / error messages and action confirmations.
 *
 * @param {boolean} isOpen - Controls visibility.
 * @param {string} type - 'success', 'error', 'warning' or 'confirm'.
 * @param {string} title - Main heading.
 * @param {string} message - Description text.
 * @param {Function} onConfirm - Action for the 'Confirm' button (type 'confirm').
 * @param {Function} onClose - Action for 'Cancel' / 'OK' (also Esc).
 * @param {string} confirmText - Label of the confirm button (default 'Confirm').
 * @param {boolean} destructive - Styles the confirm button as destructive.
 */
// success / error / warning are the bold result popups (solid colour band, solid
// icon chip, coloured title and OK button); confirm keeps the neutral look.
const TYPES = {
  success: { icon: CheckCircle2, chip: 'bg-success text-success-foreground', band: 'bg-success', title: 'text-success', ok: 'bg-success text-success-foreground hover:bg-success/90' },
  error: { icon: AlertCircle, chip: 'bg-destructive text-destructive-foreground', band: 'bg-destructive', title: 'text-destructive', ok: 'bg-destructive text-destructive-foreground hover:bg-destructive/90' },
  warning: { icon: AlertTriangle, chip: 'bg-warning text-warning-foreground', band: 'bg-warning', title: 'text-warning-foreground', ok: 'bg-warning text-warning-foreground hover:bg-warning/90' },
  confirm: { icon: HelpCircle, chip: 'bg-warning/15 text-warning-foreground', band: '', title: 'text-foreground', ok: 'bg-primary text-primary-foreground hover:bg-primary/90' },
};

const ModalAlertInner = ({ type = 'success', title, message, onConfirm, onClose, confirmText = 'Confirm', destructive = false }) => {
  const dialogRef = useDialogBehavior(onClose);
  const titleId = React.useId();
  const descId = React.useId();
  const { icon: Icon, chip, band, title: titleClass, ok } = TYPES[type] || TYPES.success;

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
        className="bg-card rounded-lg p-6 w-full max-w-sm shadow-lg border animate-in zoom-in-95 duration-200 flex flex-col items-center text-center overflow-hidden relative"
      >
        {band && <span className={`absolute inset-x-0 top-0 h-2 ${band}`} aria-hidden="true" />}
        <span className={`mb-4 mt-1 flex h-12 w-12 items-center justify-center rounded-full ${chip}`}>
          <Icon size={24} aria-hidden="true" />
        </span>

        <h3 id={titleId} className={`text-lg font-bold mb-1 ${titleClass}`}>{title}</h3>
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
              className={`h-9 w-full rounded-md text-sm font-semibold transition-colors ${ok}`}
              autoFocus
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
