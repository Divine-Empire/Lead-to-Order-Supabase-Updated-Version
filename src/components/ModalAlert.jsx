import React from 'react';
import { CheckCircle2, AlertCircle, HelpCircle } from 'lucide-react';

/**
 * ModalAlert Component
 * A premium modal for success messages and action confirmations.
 * 
 * @param {boolean} isOpen - Controls visibility.
 * @param {string} type - 'success', 'error', or 'confirm'.
 * @param {string} title - Main heading.
 * @param {string} message - Description text.
 * @param {Function} onConfirm - Action for 'Confirm' button.
 * @param {Function} onClose - Action for 'Cancel/OK' button.
 */
const ModalAlert = ({ 
  isOpen, 
  type = 'success', 
  title, 
  message, 
  onConfirm, 
  onClose 
}) => {
  if (!isOpen) return null;

  const config = {
    success: {
      icon: <CheckCircle2 className="text-emerald-500" size={52} />,
      btnColor: 'bg-emerald-600 hover:bg-emerald-700',
      iconBg: 'bg-emerald-50',
      shadow: 'shadow-emerald-200/50'
    },
    error: {
      icon: <AlertCircle className="text-rose-500" size={52} />,
      btnColor: 'bg-rose-600 hover:bg-rose-700',
      iconBg: 'bg-rose-50',
      shadow: 'shadow-rose-200/50'
    },
    confirm: {
      icon: <HelpCircle className="text-amber-500" size={52} />,
      btnColor: 'bg-amber-600 hover:bg-amber-700',
      iconBg: 'bg-amber-50',
      shadow: 'shadow-amber-200/50'
    }
  }[type] || {};

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-[1000] p-4 animate-in fade-in duration-300">
      <div 
        className={`bg-white rounded-[2rem] p-8 w-full max-w-sm shadow-2xl ${config.shadow} animate-in zoom-in-95 duration-300 flex flex-col items-center text-center relative overflow-hidden`}
      >
        {/* Visual Accent */}
        <div className={`absolute top-0 left-0 right-0 h-2 ${config.btnColor}`} />

        <div className={`mb-6 ${config.iconBg} p-6 rounded-[2rem] flex items-center justify-center`}>
          {config.icon}
        </div>
        
        <h3 className="text-2xl font-black text-slate-800 mb-3 tracking-tight">{title}</h3>
        <p className="text-slate-500 text-sm font-medium mb-8 leading-relaxed px-2">
          {message}
        </p>

        <div className="flex gap-4 w-full">
          {type === 'confirm' ? (
            <>
              <button
                onClick={() => {
                  onConfirm();
                  onClose();
                }}
                className={`flex-1 text-white font-bold py-4 rounded-2xl transition-all active:scale-95 shadow-lg shadow-amber-200/50 ${config.btnColor}`}
              >
                Confirm
              </button>
              <button
                onClick={onClose}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold py-4 rounded-2xl transition-all active:scale-95"
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              onClick={onClose}
              className={`w-full text-white font-bold py-4 rounded-2xl transition-all active:scale-95 shadow-lg ${config.btnColor} ${config.shadow.replace('200', '300')}`}
            >
              Great, thanks!
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ModalAlert;
