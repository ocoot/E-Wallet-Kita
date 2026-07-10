import React from "react";
import { Loader2 } from "lucide-react";

type Variant = "primary" | "secondary" | "danger" | "ghost";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  loading?: boolean;
}

const VARIANT_CLASS: Record<Variant, string> = {
  primary: "bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-950/20 light_sakura:bg-rose-500 light_sakura:hover:bg-rose-400 light_sakura:shadow-rose-100/40",
  secondary: "bg-slate-800 hover:bg-slate-700 text-white light_sakura:bg-rose-100 light_sakura:text-slate-700 light_sakura:hover:bg-rose-200",
  danger: "bg-red-600 hover:bg-red-500 text-white",
  ghost: "bg-transparent hover:bg-slate-800 light_sakura:hover:bg-rose-100 text-slate-300 light_sakura:text-slate-700",
};

export const Button: React.FC<ButtonProps> = ({
  variant = "primary",
  loading,
  disabled,
  className = "",
  children,
  ...rest
}) => {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={`min-h-[44px] px-4.5 py-2.5 rounded-xl font-sans text-sm font-semibold transition-all flex items-center justify-center gap-2 cursor-pointer
        disabled:opacity-40 disabled:cursor-not-allowed select-none active:scale-[0.98] ${VARIANT_CLASS[variant]} ${className}`}
    >
      {loading && <Loader2 size={16} className="animate-spin shrink-0" />}
      {children}
    </button>
  );
};
