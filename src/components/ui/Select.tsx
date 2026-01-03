
import * as React from 'react';

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: { value: string; label: string }[];
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, options, className = '', ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="block text-xs md:text-sm font-semibold text-slate-700 mb-1.5 ml-1 uppercase tracking-wide md:tracking-normal">
            {label}
          </label>
        )}
        <div className="relative">
          <select
            ref={ref}
            className={`
              w-full bg-white border border-slate-300 text-slate-900 
              text-base md:text-sm /* text-base prevents iOS zoom */
              rounded-xl 
              focus:ring-2 focus:ring-brand-500 focus:border-brand-500 block 
              py-3 px-4 pr-10
              transition-all duration-200 shadow-sm appearance-none
              disabled:bg-slate-100
              ${error ? 'border-red-500 focus:ring-red-200' : ''}
              ${className}
            `}
            {...props}
          >
            {options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          {/* Custom Chevron */}
          <div className="absolute inset-y-0 right-0 flex items-center px-3 pointer-events-none text-slate-500">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
        {error && (
          <p className="mt-1 text-xs text-red-600 font-medium ml-1 flex items-center gap-1">
             <span className="text-[10px]">●</span> {error}
          </p>
        )}
      </div>
    );
  }
);

Select.displayName = 'Select';
