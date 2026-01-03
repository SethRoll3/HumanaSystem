
import * as React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, icon, className = '', ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="block text-xs md:text-sm font-semibold text-slate-700 mb-1.5 ml-1 uppercase tracking-wide md:tracking-normal">
            {label}
          </label>
        )}
        <div className="relative group">
          {icon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-brand-600 transition-colors pointer-events-none">
              {icon}
            </div>
          )}
          <input
            ref={ref}
            className={`
              w-full bg-white border border-slate-300 text-slate-900 
              text-base md:text-sm /* text-base prevents iOS zoom on focus */
              rounded-xl 
              focus:ring-2 focus:ring-brand-500 focus:border-brand-500 block 
              py-3 px-4
              placeholder-slate-400 transition-all duration-200 shadow-sm
              disabled:bg-slate-100 disabled:text-slate-500
              ${icon ? 'pl-10' : ''}
              ${error ? 'border-red-500 focus:ring-red-200 focus:border-red-500' : ''}
              ${className}
            `}
            {...props}
          />
        </div>
        {error && (
          <p className="mt-1 text-xs text-red-600 font-medium ml-1 animate-pulse flex items-center gap-1">
            <span className="text-[10px]">●</span> {error}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
