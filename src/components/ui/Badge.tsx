import React from "react";

type BadgeVariant = "neutral" | "success" | "danger" | "warning" | "info";

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  children: React.ReactNode;
}

const VARIANT_CLASS: Record<BadgeVariant, string> = {
  neutral: "bg-slate-800 text-slate-300 border-slate-700 light_sakura:bg-rose-50 light_sakura:text-slate-600 light_sakura:border-rose-100",
  success: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 light_sakura:bg-emerald-50 light_sakura:text-emerald-700 light_sakura:border-emerald-100",
  danger: "bg-red-500/10 text-red-400 border-red-500/20 light_sakura:bg-red-50 light_sakura:text-red-700 light_sakura:border-red-100",
  warning: "bg-amber-500/10 text-amber-400 border-amber-500/20 light_sakura:bg-amber-50 light_sakura:text-amber-700 light_sakura:border-amber-100",
  info: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20 light_sakura:bg-indigo-50 light_sakura:text-indigo-700 light_sakura:border-indigo-100",
};

export const Badge: React.FC<BadgeProps> = ({ variant = "neutral", children, className = "", ...rest }) => {
  return (
    <span
      {...rest}
      className={`inline-flex items-center justify-center rounded-full px-2.5 py-0.5 text-xs font-semibold border ${VARIANT_CLASS[variant]} ${className}`}
    >
      {children}
    </span>
  );
};
