import React from 'react';
import useDialogBehavior from './useDialogBehavior';

const ModalViewInner = ({
  onClose,
  title,
  children,
  maxWidth = 'max-w-2xl',
  zIndex = 'z-[100]'
}) => {
  const dialogRef = useDialogBehavior(onClose);
  const titleId = React.useId();

  return (
    <div className={`fixed inset-0 lg:left-56 2xl:left-60 bg-black/50 flex items-center justify-center ${zIndex} p-3 animate-in fade-in duration-200 overflow-hidden`}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`bg-card rounded-lg shadow-lg w-full ${maxWidth} h-[450px] max-h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 border`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b flex items-center flex-shrink-0">
          <h2 id={titleId} className="text-base font-semibold text-foreground">{title}</h2>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 modal-scrollbar">
          {children}
        </div>

        <div className="px-4 py-3 border-t flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="h-9 w-full rounded-md border border-input bg-card text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

const ModalView = (props) => (props.isOpen ? <ModalViewInner {...props} /> : null);

export default ModalView;
