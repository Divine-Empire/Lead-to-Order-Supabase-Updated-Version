import React from 'react';
import { FormActionButtons } from './StandardButtons';
import useDialogBehavior from './useDialogBehavior';

/**
 * ModalForm: standard form dialog (header, scrolling body, Cancel/Save footer).
 *
 * - Esc closes, Tab stays inside, focus returns to the opener on close.
 * - The first field is focused on open (as before).
 * - The overlay leaves the sidebar visible on large screens; its offset matches the
 *   sidebar widths (w-56, 2xl:w-60).
 */
const ModalFormInner = ({
  onClose,
  title,
  children,
  onSubmit,
  submitText = 'Submit',
  cancelText = 'Cancel',
  maxWidth = 'max-w-2xl',
  maxHeight = '60vh',
  zIndex = 'z-[100]'
}) => {
  const dialogRef = useDialogBehavior(onClose, { autoFocus: false });
  const formRef = React.useRef(null);
  const titleId = React.useId();

  React.useEffect(() => {
    if (!formRef.current) return undefined;
    const focusable = formRef.current.querySelectorAll(
      'input:not([disabled]), button:not([disabled]), [tabindex="0"]:not([disabled])'
    );
    const firstField = focusable[0];
    if (!firstField) return undefined;
    const timer = setTimeout(() => firstField.focus(), 150);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className={`fixed inset-0 lg:left-56 2xl:left-60 bg-black/50 flex items-center justify-center ${zIndex} p-3 md:p-4 animate-in fade-in duration-200`}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`bg-card rounded-lg shadow-lg w-full ${maxWidth} flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 border max-md:max-h-[55vh]!`}
        style={{ maxHeight }}
      >
        <div className="px-4 py-3 border-b flex items-center flex-shrink-0">
          <h2 id={titleId} className="text-base font-semibold text-foreground">{title}</h2>
        </div>

        <div className="flex-1 overflow-y-auto bg-card min-h-0 modal-scrollbar">
          <div className="px-3 py-3 md:px-4">
            <form ref={formRef} id="ultra-compact-form" onSubmit={onSubmit} autoComplete="off" className="space-y-1.5 md:space-y-2 text-left">
              {children}
            </form>
          </div>
        </div>

        <div className="px-4 py-3 border-t bg-card flex-shrink-0">
          <FormActionButtons
            onCancel={onClose}
            cancelText={cancelText}
            submitText={submitText}
            className="w-full"
            formId="ultra-compact-form"
          />
        </div>
      </div>
    </div>
  );
};

// The early return lives out here so hooks inside ModalFormInner always run in the same order.
const ModalForm = (props) => (props.isOpen ? <ModalFormInner {...props} /> : null);

export default ModalForm;
