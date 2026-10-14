import React from 'react';
import useDialogBehavior from './useDialogBehavior';

/**
 * MasterDialog: dialog shell for the master-data add/edit forms that own their own
 * form element and footer buttons (children render inside a scrolling body).
 *
 * Esc closes, Tab stays inside, focus returns to the opener. Render it only while open.
 */
const MasterDialog = ({ title, onClose, children, maxWidth = 'max-w-md', zIndex = 'z-[100]' }) => {
  const dialogRef = useDialogBehavior(onClose);
  const titleId = React.useId();

  return (
    <div className={`fixed inset-0 lg:left-56 2xl:left-60 bg-black/50 flex items-center justify-center ${zIndex} p-3 md:p-4 animate-in fade-in duration-200`}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`bg-card rounded-lg shadow-lg border w-full ${maxWidth} max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200`}
      >
        <div className="px-4 py-3 border-b flex items-center shrink-0">
          <h2 id={titleId} className="text-base font-semibold text-foreground">{title}</h2>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto modal-scrollbar">{children}</div>
      </div>
    </div>
  );
};

export default MasterDialog;
