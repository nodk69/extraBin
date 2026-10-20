import React from 'react';

interface PixelCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  title?: string;
  className?: string;
  headerRight?: React.ReactNode;
}

export const PixelCard: React.FC<PixelCardProps> = ({
  children,
  title = 'TERMINAL_SESSION_v1',
  className = '',
  headerRight,
  ...props
}) => {
  return (
    <div className={`uiverse-pixel-card ${className}`} {...props}>
      <div className="uiverse-pixel-header">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 bg-[#00cc66] shadow-[1px_1px_#000]" />
          <span>&gt; {title}</span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          {headerRight}
          <div className="flex items-center gap-1 font-mono text-slate-400 select-none">
            <span className="px-1 border border-slate-700 bg-slate-900 text-slate-300">_</span>
            <span className="px-1 border border-slate-700 bg-slate-900 text-slate-300">□</span>
            <span className="px-1 border border-red-900 bg-red-950 text-red-400">×</span>
          </div>
        </div>
      </div>
      <div className="p-5 sm:p-7 relative z-10">{children}</div>
    </div>
  );
};
