import React from 'react';
import { motion } from 'framer-motion';

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: React.ReactNode;
  description?: string;
  icon?: React.ReactNode;
  activeColorClass?: string;
  activeGlowClass?: string;
  disabled?: boolean;
  id?: string;
}

export const ToggleSwitch: React.FC<ToggleSwitchProps> = ({
  checked,
  onChange,
  label,
  description,
  icon,
  activeColorClass = 'bg-brand-500',
  activeGlowClass = 'shadow-[0_0_12px_rgba(34,197,94,0.35)]',
  disabled = false,
  id,
}) => {
  return (
    <div
      onClick={() => !disabled && onChange(!checked)}
      className={`flex items-start justify-between gap-4 p-3.5 rounded-xl border transition-all duration-200 cursor-pointer select-none ${
        checked
          ? 'border-brand-500/40 bg-brand-500/5'
          : 'border-slate-800/80 bg-slate-900/40 hover:border-slate-700/80 hover:bg-slate-900/60'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <div className="flex items-start gap-3">
        {icon && (
          <div
            className={`p-2 rounded-lg transition-colors mt-0.5 ${
              checked
                ? 'bg-brand-500/20 text-brand-400'
                : 'bg-slate-800/60 text-slate-400'
            }`}
          >
            {icon}
          </div>
        )}
        <div className="space-y-0.5">
          {label && (
            <div className="text-sm font-medium text-slate-200 flex items-center gap-2">
              {label}
            </div>
          )}
          {description && (
            <p className="text-xs text-slate-400 leading-relaxed">
              {description}
            </p>
          )}
        </div>
      </div>

      <button
        type="button"
        id={id}
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-brand-500/50 mt-1 ${
          checked ? `${activeColorClass} ${activeGlowClass}` : 'bg-slate-700'
        }`}
      >
        <motion.span
          layout
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-md ring-0 ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
};
