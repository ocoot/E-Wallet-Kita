import React from "react";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: string;
  label?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ error, label, className = "", id, ...rest }, ref) => {
    return (
      <div className="w-full space-y-1.5 text-left">
        {label && (
          <label
            htmlFor={id}
            className="block text-[clamp(0.5625rem,2.6vw,0.625rem)] font-bold uppercase tracking-wider text-slate-400 light_sakura:text-slate-500"
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={id}
          className={`w-full px-3.5 py-2.5 rounded-xl text-sm bg-slate-800 border text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all
            border-slate-700/80 hover:border-slate-600
            light_sakura:bg-white light_sakura:border-rose-200 light_sakura:text-slate-700 light_sakura:hover:border-rose-300 light_sakura:focus:ring-rose-400
            disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]
            ${error ? "border-red-500 focus:ring-red-500 light_sakura:border-red-400" : ""}
            ${className}`}
          {...rest}
        />
        {error && (
          <p className="text-xs text-red-500 light_sakura:text-red-600 mt-1">
            {error}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";
