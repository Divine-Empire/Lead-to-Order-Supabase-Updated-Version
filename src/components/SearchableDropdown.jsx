import React, { useState, useRef, useEffect } from 'react';
import { Search, ChevronDown, Check, Plus, Square, CheckSquare } from 'lucide-react';

/**
 * SearchableDropdown Component
 * A custom select component with built-in search functionality.
 * Supports full keyboard accessibility (arrows, enter, escape, tab).
 * 
 * @param {Array} options - Array of { value, label } objects.
 * @param {any} value - Currently selected value.
 * @param {Function} onChange - Callback function when an option is selected.
 * @param {string} placeholder - Text to show when no value is selected.
 * @param {string} className - Additional CSS classes for the container.
 */
const SearchableDropdown = ({ 
  options, 
  value, 
  onChange, 
  onAdd, 
  placeholder = "Select option...", 
  className = "",
  height = "h-[30px] md:h-[34px]",
  rounded = "rounded",
  isMulti = false
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [openUp, setOpenUp] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);

  const dropdownRef = useRef(null);
  const triggerRef = useRef(null);
  const searchInputRef = useRef(null);
  const listRef = useRef(null);

  const allOptions = [{ value: '', label: placeholder }, ...options];

  // Filter options based on search term
  const filteredOptions = allOptions.filter(opt =>
    String(opt?.label || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Find the label for the current value
  const selectedOption = allOptions.find(opt => opt.value === value);
  const selectedOptions = isMulti && Array.isArray(value) ? allOptions.filter(opt => value.includes(opt.value)) : [];
  
  const getTriggerText = () => {
    if (isMulti) {
      if (!value || value.length === 0) return placeholder;
      const valArray = Array.isArray(value) ? value : [value];
      return selectedOptions.map(opt => opt.label || opt.value).join(", ") || valArray.join(", ");
    }
    return selectedOption ? selectedOption.label : value ? value : placeholder;
  };
  
  const isSelected = (optValue) => {
    if (isMulti) {
      if (optValue === '') return (!value || value.length === 0);
      return Array.isArray(value) && value.includes(optValue);
    }
    return value === optValue;
  };

  const hasAddButton = !!onAdd;
  const totalItemCount = filteredOptions.length + (hasAddButton ? 1 : 0);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        if (searchInputRef.current) {
          searchInputRef.current.focus();
        }
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Sync focused index with search query changes or value
  useEffect(() => {
    if (isOpen) {
      if (!isMulti && value) {
        const idx = filteredOptions.findIndex(opt => opt.value === value);
        setFocusedIndex(idx >= 0 ? idx : 0);
      } else {
        setFocusedIndex(0);
      }
    } else {
      setFocusedIndex(-1);
    }
  }, [isOpen, searchTerm, value]);

  // Determine direction based on space
  useEffect(() => {
    if (isOpen && dropdownRef.current) {
      const rect = dropdownRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const dropdownHeight = 300; // Estimated max height
      if (spaceBelow < dropdownHeight && rect.top > dropdownHeight) {
        setOpenUp(true);
      } else {
        setOpenUp(false);
      }
    }
  }, [isOpen]);

  // Scroll focused item into view
  useEffect(() => {
    if (isOpen && focusedIndex >= 0) {
      if (focusedIndex < filteredOptions.length && listRef.current) {
        const activeEl = listRef.current.children[focusedIndex];
        if (activeEl) {
          activeEl.scrollIntoView({ block: 'nearest' });
        }
      }
    }
  }, [focusedIndex, isOpen, filteredOptions.length]);

  // Close dropdown when clicking/touching outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside, true);
    document.addEventListener("touchstart", handleClickOutside, true);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside, true);
      document.removeEventListener("touchstart", handleClickOutside, true);
    };
  }, []);

  const handleToggle = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsOpen(!isOpen);
  };



  const handleBlur = (e) => {
    // If focus leaves the dropdown wrapper container, close the dropdown
    if (dropdownRef.current && !dropdownRef.current.contains(e.relatedTarget)) {
      setIsOpen(false);
    }
  };

  const handleKeyDown = (e) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (!isOpen) {
          setIsOpen(true);
        } else if (totalItemCount > 0) {
          setFocusedIndex(prev => (prev + 1) % totalItemCount);
        }
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (!isOpen) {
          setIsOpen(true);
        } else if (totalItemCount > 0) {
          setFocusedIndex(prev => (prev - 1 + totalItemCount) % totalItemCount);
        }
        break;
      case 'Enter':
        if (isOpen) {
          e.preventDefault();
          if (focusedIndex >= 0 && focusedIndex < filteredOptions.length) {
            const opt = filteredOptions[focusedIndex];
            if (isMulti) {
              if (opt.value === '') {
                onChange([]);
              } else {
                const currentVal = Array.isArray(value) ? value : [];
                if (currentVal.includes(opt.value)) {
                  onChange(currentVal.filter(v => v !== opt.value));
                } else {
                  onChange([...currentVal, opt.value]);
                }
              }
            } else {
              onChange(opt.value);
              setIsOpen(false);
              setSearchTerm("");
              if (triggerRef.current) triggerRef.current.focus();
            }
          } else if (focusedIndex === filteredOptions.length && onAdd) {
            onAdd();
            setIsOpen(false);
            if (triggerRef.current) triggerRef.current.focus();
          }
        } else {
          e.preventDefault();
          setIsOpen(true);
        }
        break;
      case ' ':
      case 'Space':
        // Only toggle if focus is not in the search input
        if (document.activeElement !== searchInputRef.current) {
          e.preventDefault();
          setIsOpen(!isOpen);
        }
        break;
      case 'Escape':
        if (isOpen) {
          e.preventDefault();
          setIsOpen(false);
          setSearchTerm("");
          if (triggerRef.current) triggerRef.current.focus();
        }
        break;
      case 'Tab':
        if (isOpen) {
          if (triggerRef.current) {
            triggerRef.current.focus();
          }
          setIsOpen(false);
        }
        break;
      default:
        break;
    }
  };

  return (
    <div 
      className={`relative ${className}`} 
      ref={dropdownRef}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
    >
      {/* Selection Trigger */}
      <button
        ref={triggerRef}
        type="button"
        onClick={handleToggle}
        className={`w-full bg-gray-50 border border-gray-200 ${rounded} px-2 py-1 flex justify-between items-center cursor-pointer hover:border-sky-500 ${height} shadow-sm group outline-none focus:ring-2 focus:ring-sky-500/20`}
      >
        <span className={`text-sm truncate ${(isMulti ? (value && value.length > 0) : (selectedOption && selectedOption.value !== '' || value)) ? 'text-gray-900 font-medium' : 'text-gray-400 font-medium'}`}>
          {getTriggerText()}
        </span>
        <ChevronDown
          size={14}
          className={`text-gray-400 group-hover:text-sky-500 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className={`absolute left-0 right-0 ${openUp ? 'bottom-full mb-1' : 'top-full mt-1'} bg-white border border-gray-200 rounded shadow-2xl z-[150] overflow-hidden min-w-[180px]`}>
          {/* Search Box */}
          <div className="p-1.5 border-b border-gray-100 bg-gray-50 flex gap-1.5 items-center">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-[7px] text-gray-400" size={10} />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Filter..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                className="w-full bg-white border border-gray-200 rounded pl-7 pr-2 py-1 text-sm focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500/20 shadow-inner"
              />
            </div>
          </div>

          {/* Options List */}
          <div className="max-h-52 overflow-y-auto py-1 scrollbar-hide" ref={listRef}>
            {filteredOptions.length > 0 ? (
              filteredOptions.map((opt, idx) => (
                <div
                  key={opt.value}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isMulti) {
                      if (opt.value === '') {
                        onChange([]);
                      } else {
                        const currentVal = Array.isArray(value) ? value : [];
                        if (currentVal.includes(opt.value)) {
                          onChange(currentVal.filter(v => v !== opt.value));
                        } else {
                          onChange([...currentVal, opt.value]);
                        }
                      }
                    } else {
                      onChange(opt.value);
                      setIsOpen(false);
                      setSearchTerm("");
                    }
                  }}
                  className={`px-3 py-1.5 text-sm cursor-pointer flex justify-between items-center transition-colors group ${
                    isSelected(opt.value) ? 'bg-slate-50/50' : ''
                  } ${
                    focusedIndex === idx 
                      ? 'bg-sky-100 text-sky-900 font-bold' 
                      : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    {isMulti ? (
                      isSelected(opt.value) ? (
                        <CheckSquare size={14} className="text-sky-600 flex-shrink-0" />
                      ) : (
                        <Square size={14} className="text-gray-300 flex-shrink-0" />
                      )
                    ) : (
                      isSelected(opt.value) && (
                        <Check size={12} className="text-sky-600 flex-shrink-0" />
                      )
                    )}
                    <span className="truncate text-[#0a3161] font-medium">{opt.label}</span>
                  </div>
                  {opt.count !== undefined && (
                    <span className="text-gray-500 text-xs pl-2 font-medium shrink-0">
                      ({opt.count})
                    </span>
                  )}
                </div>
              ))
            ) : (
              <div className="px-3 py-4 text-xs text-center text-gray-400 italic font-medium uppercase tracking-tight">
                No matching results found
              </div>
            )}
          </div>

          {/* Always visible Add New at the bottom */}
          {onAdd && (
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onAdd();
                setIsOpen(false);
              }}
              onTouchStart={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onAdd();
                setIsOpen(false);
              }}
              className={`w-full border-t border-gray-100 px-3 py-2 text-sky-600 transition-all flex items-center justify-center gap-2 bg-white active:bg-sky-100 ${
                focusedIndex === filteredOptions.length 
                  ? 'bg-sky-100 font-bold' 
                  : 'hover:bg-sky-50'
              }`}
            >
              <Plus size={14} strokeWidth={3} />
              <span className="text-xs font-black uppercase tracking-widest">Add New</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default SearchableDropdown;
