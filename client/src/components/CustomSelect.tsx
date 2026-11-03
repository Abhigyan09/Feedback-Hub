import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
  badge?: string | number;
  icon?: React.ReactNode;
}

export interface CustomSelectProps {
  id?: string;
  label?: string;
  icon?: React.ReactNode;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
  buttonClassName?: string;
  menuClassName?: string;
  align?: 'left' | 'right';
  fullWidth?: boolean;
  disabled?: boolean;
}

export const CustomSelect: React.FC<CustomSelectProps> = ({
  id,
  label,
  icon,
  value,
  onChange,
  options,
  placeholder = 'Select...',
  className = '',
  buttonClassName = '',
  menuClassName = '',
  align = 'left',
  fullWidth = false,
  disabled = false
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.value === value);

  // Close on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div 
      ref={containerRef} 
      className={`relative ${fullWidth ? 'w-full' : 'inline-block'} text-left font-poppins ${className}`}
    >
      {/* Trigger Button */}
      <button
        type="button"
        id={id}
        disabled={disabled}
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className={`flex items-center justify-between space-x-1.5 bg-slate-50 hover:bg-slate-100/80 active:bg-slate-100 border border-slate-200 px-3 py-1.5 rounded-[8px] text-xs font-medium text-slate-700 transition-colors cursor-pointer shadow-2xs focus:outline-none focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed ${
          fullWidth ? 'w-full' : ''
        } ${buttonClassName}`}
      >
        <div className="flex items-center space-x-1.5 min-w-0 flex-1 truncate">
          {icon && (
            <span className="shrink-0 text-slate-500">
              {icon}
            </span>
          )}
          {label && (
            <span className="text-slate-400 font-normal text-xs mr-0.5 select-none shrink-0">
              {label}:
            </span>
          )}
          <span className="text-slate-800 font-medium truncate text-left">
            {selectedOption ? selectedOption.label : placeholder}
          </span>
        </div>
        
        <ChevronDown
          className={`w-3.5 h-3.5 text-slate-400 shrink-0 ml-1.5 transition-transform duration-150 ${
            isOpen ? 'rotate-180 text-blue-600' : ''
          }`}
        />
      </button>

      {/* Floating Dropdown Menu (Styled with 10px rounded corners & soft shadow) */}
      {isOpen && (
        <div
          role="listbox"
          tabIndex={-1}
          className={`absolute top-full mt-1.5 ${
            align === 'right' ? 'right-0' : 'left-0'
          } z-50 min-w-full w-max max-w-[340px] bg-white border border-slate-200 rounded-[10px] shadow-xl p-1.5 max-h-64 overflow-y-auto animate-in fade-in zoom-in-95 duration-100 select-none font-poppins ${menuClassName}`}
        >
          {options.map((option) => {
            const isSelected = option.value === value;

            return (
              <div
                key={option.value}
                role="option"
                aria-selected={isSelected}
                tabIndex={0}
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onChange(option.value);
                    setIsOpen(false);
                  }
                }}
                className={`flex items-center justify-between px-3 py-1.5 text-xs rounded-[6px] transition-colors cursor-pointer group ${
                  isSelected
                    ? 'bg-blue-50 text-blue-700 font-medium'
                    : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900 font-normal'
                }`}
              >
                <div className="flex items-center space-x-2 truncate pr-2">
                  {option.icon && (
                    <span className="shrink-0">{option.icon}</span>
                  )}
                  <span className="truncate">{option.label}</span>
                </div>

                {isSelected && (
                  <Check className="w-3.5 h-3.5 text-blue-600 shrink-0 ml-2" />
                )}
                {!isSelected && option.badge !== undefined && (
                  <span className="text-[10px] font-mono text-slate-400 group-hover:text-slate-600 shrink-0 ml-2">
                    {option.badge}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
