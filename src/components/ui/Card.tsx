import React from "react";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export const Card: React.FC<CardProps> = ({ children, className = "", ...rest }) => {
  return (
    <div
      {...rest}
      className={`rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-sm text-white transition-all
        light_sakura:border-rose-100 light_sakura:bg-white light_sakura:text-slate-800 ${className}`}
    >
      {children}
    </div>
  );
};
