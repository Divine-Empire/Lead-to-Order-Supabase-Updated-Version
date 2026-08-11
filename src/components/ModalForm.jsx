import React from 'react';
import { FormActionButtons } from './StandardButtons';

/**
 * ModalForm Component - Ultra Compact Edition
 * 
 * Final Refinements:
 * - Removed Cross (X) icon as requested.
 * - Reduced vertical gaps (space-y-2) for maximum density.
 * - Compacted padding in Header and Body.
 * - Maintains fixed dimensions and invisible scrollbar.
 */
const ModalForm = ({
  isOpen,
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
  if (!isOpen) return null;

  const formRef = React.useRef(null);

  React.useEffect(() => {
    if (formRef.current) {
      const focusable = formRef.current.querySelectorAll(
        'input:not([disabled]), button:not([disabled]), [tabindex="0"]:not([disabled])'
      );
      const firstField = Array.from(focusable).find(() => true);
      if (firstField) {
        const timer = setTimeout(() => {
          firstField.focus();
        }, 150);
        return () => clearTimeout(timer);
      }
    }
  }, []);

  return (
    <div className={`fixed inset-0 lg:left-56 2xl:left-60 bg-black/60 backdrop-blur-[1px] flex items-center justify-center ${zIndex} p-3 md:p-4 animate-in fade-in duration-200`}>
      <style dangerouslySetInnerHTML={{
        __html: `
        @media (max-width: 767px) {
          .responsive-modal-height {
            max-height: 55vh !important;
          }
        }
        .modal-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .modal-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .modal-scrollbar::-webkit-scrollbar-thumb {
          background-color: #d1d5db;
          border-radius: 4px;
        }
      `}} />
      <div
        className={`bg-white rounded-xl shadow-2xl w-full ${maxWidth} flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 border border-gray-200 responsive-modal-height`}
        style={{ scale: 1, maxHeight }}
      >
        {/* Ultra-Compact Header - No Cross Icon */}
        <div className="px-4 py-2 border-b border-gray-100 flex items-center justify-center bg-white flex-shrink-0 z-20">
          <h2 className="text-[10px] md:text-sm font-black text-gray-800 uppercase tracking-widest text-center">{title}</h2>
        </div>

        {/* Minimal Scrollable Body */}
        <div
          className="flex-1 overflow-y-auto bg-white min-h-0 z-10 modal-scrollbar"
          style={{
            scrollbarWidth: 'thin',
            scrollbarColor: '#d1d5db transparent'
          }}
        >

          <div className="px-3 py-2 md:px-4 md:py-3 modal-scrollbar">
            <form ref={formRef} id="ultra-compact-form" onSubmit={onSubmit} autoComplete="off" className="space-y-1.5 md:space-y-2 text-left">
              {children}
            </form>
          </div>
        </div>

        {/* Standardized Footer Buttons */}
        <div className="px-4 py-2 border-t border-gray-100 bg-white flex-shrink-0 z-20">
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

export default ModalForm;
