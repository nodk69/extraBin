import React from 'react';

export interface BadgeProps {
  children: React.ReactNode;
  variant?: 'success' | 'neutral' | 'warning' | 'danger' | 'info';
  size?: 'sm' | 'md';
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'neutral',
  size = 'md',
  className = '',
}) => {
  const sizeStyles = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2.5 py-1 text-xs font-medium',
  };

  const variantStyles = {
    neutral: 'bg-slate-800 text-slate-300 border border-slate-700',
    success: 'bg-emerald-950/70 text-emerald-400 border border-emerald-800/60',
    warning: 'bg-amber-950/70 text-amber-400 border border-amber-800/60',
    danger: 'bg-rose-950/70 text-rose-400 border border-rose-800/60',
    info: 'bg-sky-950/70 text-sky-400 border border-sky-800/60',
  };

  return (
    <span className={`inline-flex items-center rounded-full font-mono ${sizeStyles[size]} ${variantStyles[variant]} ${className}`}>
      {children}
    </span>
  );
};
