import React from 'react';
import { XCircle, Save, Check } from 'lucide-react';

/**
 * TabSwitcher Component - Standardized Tabs for Pending/History
 */
export const TabSwitcher = ({ activeTab, onTabChange, tabs }) => {
  return (
    <div className="flex justify-start gap-3 px-2 sm:px-0 flex-wrap w-full sm:w-auto">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`flex-1 sm:flex-initial h-[32px] md:h-[38px] flex items-center justify-center px-3 sm:px-5 whitespace-nowrap text-xs font-black rounded-lg transition-all duration-200 border shadow-sm ${
            activeTab === tab.id
              ? 'brand-gradient text-white border-transparent shadow-primary/20'
              : 'bg-white text-gray-700 border-gray-200 hover:bg-primary/5 hover:text-primary hover:border-primary/20'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
};

/**
 * FormActionButtons Component - Standardized Save/Cancel Buttons
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
        className="flex-1 px-2 md:px-4 py-2 border border-gray-200 rounded-lg text-gray-500 font-bold hover:bg-gray-50 transition-all active:scale-95 text-xs uppercase tracking-widest flex items-center justify-center gap-2"
        title={cancelText}
      >
        <XCircle size={18} />
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
        className="flex-[1.5] brand-gradient hover:opacity-90 text-white font-bold py-2 rounded-lg transition-all active:scale-95 shadow-md shadow-primary/20 text-xs uppercase tracking-widest disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        title={submitText}
      >
        {loading ? (
          <>
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            <span className="hidden sm:inline">Processing...</span>
          </>
        ) : (
          <>
            <Save size={18} />
            <span className="hidden sm:inline">{submitText}</span>
          </>
        )}
      </button>
    </div>
  );
};
