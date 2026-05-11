import React from 'react';

export const Logo = ({ className = "w-10 h-10", showText = true }: { className?: string, showText?: boolean }) => {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="relative flex items-center justify-center shrink-0">
        <svg 
          viewBox="0 0 100 100" 
          fill="none" 
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full"
        >
          {/* Shopping Bag Shape */}
          <path 
            d="M25 35H75L85 85H15L25 35Z" 
            stroke="currentColor" 
            strokeWidth="8" 
            strokeLinejoin="round"
            className="text-emerald-800"
          />
          {/* Bag Handle */}
          <path 
            d="M35 35C35 25 40 20 50 20C60 20 65 25 65 35" 
            stroke="currentColor" 
            strokeWidth="8" 
            strokeLinecap="round"
            className="text-emerald-700"
          />
          {/* Modern Checkmark Symbol overlay */}
          <path 
            d="M40 55L50 65L75 35" 
            stroke="currentColor" 
            strokeWidth="10" 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            className="text-emerald-500 drop-shadow-md"
          />
        </svg>
      </div>
      {showText && (
        <div className="flex flex-col leading-none">
          <span className="text-xl font-black tracking-tight text-emerald-900">
            Dukaan<span className="text-emerald-500">Pro</span>
          </span>
          <span className="text-[8px] font-bold uppercase tracking-[0.2em] text-emerald-600/70">
            Become Digital
          </span>
        </div>
      )}
    </div>
  );
};
