import React from "react";

export const EmptyState = ({ message }: { message: string }) => {
  return (
    <div className="flex flex-col items-center justify-center p-10 text-center space-y-4">
      <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="text-slate-700 light_sakura:text-rose-200">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
      <p className="font-sans text-xs text-gray-500 light_sakura:text-slate-400 max-w-[200px]">
        {message}
      </p>
    </div>
  );
};
