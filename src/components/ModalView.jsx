import React from 'react';

const ModalView = ({
  isOpen,
  onClose,
  title,
  children,
  maxWidth = 'max-w-2xl',
  zIndex = 'z-[100]'
}) => {
  if (!isOpen) return null;

  return (
    <div className={`fixed inset-0 lg:left-64 2xl:left-72 bg-black/60 backdrop-blur-[1px] flex items-center justify-center ${zIndex} p-3 animate-in fade-in duration-200 overflow-hidden`}>
      <div
        className={`bg-white rounded-xl shadow-2xl w-full ${maxWidth} h-[450px] max-h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 border border-gray-200`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Compact Header */}
        <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-center flex-shrink-0">
          <h2 className="text-[11px] font-black text-gray-800 uppercase tracking-widest">{title}</h2>
        </div>

        {/* Scrollable Body - Hidden scrollbar */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar" style={{ msOverflowStyle: 'none', scrollbarWidth: 'none' }}>
          <style dangerouslySetInnerHTML={{__html: `
            .no-scrollbar::-webkit-scrollbar {
              display: none;
            }
          `}} />
          {children}
        </div>

        {/* Footer Action */}
        <div className="px-4 py-3 border-t border-gray-100 flex-shrink-0">
          <button
            onClick={onClose}
            className="w-full py-2 border border-gray-200 rounded-lg text-xs text-gray-500 hover:bg-gray-50 transition font-black uppercase tracking-widest"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default ModalView;
