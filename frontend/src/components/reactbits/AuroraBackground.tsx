import React from 'react';

export const AuroraBackground: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = '',
}) => {
  return (
    <div className={`relative min-h-screen w-full bg-slate-950 text-slate-100 overflow-x-hidden ${className}`}>
      {/* Ambient lighting effects */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        {/* Subtle dot matrix grid */}
        <div 
          className="absolute inset-0 opacity-[0.035]"
          style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, #ffffff 1px, transparent 0)`,
            backgroundSize: '36px 36px',
          }}
        />

        {/* Dynamic ambient blur orbs */}
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[800px] h-[450px] bg-gradient-to-b from-brand-500/15 via-emerald-500/10 to-transparent rounded-full blur-[140px] pointer-events-none opacity-80" />
        <div className="absolute top-1/4 -right-32 w-[600px] h-[500px] bg-gradient-to-br from-cyan-500/10 via-indigo-600/5 to-transparent rounded-full blur-[130px] pointer-events-none opacity-60" />
        <div className="absolute -bottom-24 -left-32 w-[650px] h-[450px] bg-gradient-to-tr from-emerald-600/10 via-brand-600/5 to-transparent rounded-full blur-[140px] pointer-events-none opacity-50" />
      </div>

      {/* Content */}
      <div className="relative z-10 flex flex-col min-h-screen">
        {children}
      </div>
    </div>
  );
};
