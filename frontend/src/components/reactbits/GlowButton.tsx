import React from 'react';
import { motion, HTMLMotionProps } from 'framer-motion';
import { Loader2 } from 'lucide-react';

interface GlowButtonProps extends Omit<HTMLMotionProps<'button'>, 'children'> {
  children: React.ReactNode;
  variant?: 'glow' | 'secondary' | 'danger' | 'ghost' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  className?: string;
}

export const GlowButton: React.FC<GlowButtonProps> = ({
  children,
  variant = 'glow',
  size = 'md',
  isLoading = false,
  disabled,
  leftIcon,
  rightIcon,
  className = '',
  ...props
}) => {
  const sizeStyles = {
    sm: 'px-3 py-1.5 text-xs gap-1.5 rounded-lg',
    md: 'px-4 py-2.5 text-sm gap-2 rounded-xl',
    lg: 'px-6 py-3 text-base gap-2.5 rounded-xl',
  };

  const variantStyles = {
    glow: 'relative bg-gradient-to-r from-brand-600 via-emerald-500 to-teal-500 text-white font-medium shadow-[0_0_20px_-3px_rgba(34,197,94,0.35)] hover:shadow-[0_0_25px_0px_rgba(34,197,94,0.5)] border border-brand-400/30',
    secondary: 'bg-slate-800/80 hover:bg-slate-700/80 text-slate-100 border border-slate-700/80 backdrop-blur-sm',
    danger: 'bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-500/20 border border-red-500/30',
    ghost: 'hover:bg-slate-800/60 text-slate-300 hover:text-white',
    outline: 'border border-slate-700/80 hover:border-slate-500/80 text-slate-200 hover:text-white bg-slate-900/40 backdrop-blur-sm',
  };

  return (
    <motion.button
      whileHover={{ scale: disabled || isLoading ? 1 : 1.015 }}
      whileTap={{ scale: disabled || isLoading ? 1 : 0.98 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      disabled={disabled || isLoading}
      className={`inline-flex items-center justify-center font-medium transition-colors select-none focus:outline-none focus:ring-2 focus:ring-brand-500/40 disabled:opacity-50 disabled:cursor-not-allowed ${sizeStyles[size]} ${variantStyles[variant]} ${className}`}
      {...props}
    >
      {isLoading ? (
        <Loader2 className="w-4 h-4 animate-spin text-current" />
      ) : (
        leftIcon
      )}
      <span>{children}</span>
      {!isLoading && rightIcon}
    </motion.button>
  );
};
