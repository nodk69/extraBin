import React from 'react';
import { motion } from 'framer-motion';

export interface TabItem<T extends string = string> {
  id: T;
  label: string;
  icon?: React.ReactNode;
  badge?: string;
}

interface AnimatedTabsProps<T extends string = string> {
  tabs: TabItem<T>[];
  activeTab: T;
  onChange: (tabId: T) => void;
  className?: string;
  layoutId?: string;
}

export function AnimatedTabs<T extends string = string>({
  tabs,
  activeTab,
  onChange,
  className = '',
  layoutId = 'animated-tab-pill',
}: AnimatedTabsProps<T>) {
  return (
    <div
      className={`relative flex items-center p-1 rounded-xl bg-slate-900/80 border border-slate-800/80 backdrop-blur-md ${className}`}
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`relative flex items-center justify-center gap-2 px-3.5 py-1.5 text-xs font-medium rounded-lg transition-colors z-10 flex-1 select-none focus:outline-none ${
              isActive ? 'text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {isActive && (
              <motion.div
                layoutId={layoutId}
                transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                className="absolute inset-0 rounded-lg bg-gradient-to-r from-brand-600 to-emerald-600 shadow-md shadow-brand-500/25 -z-10"
              />
            )}
            {tab.icon && <span className="w-3.5 h-3.5">{tab.icon}</span>}
            <span>{tab.label}</span>
            {tab.badge && (
              <span
                className={`ml-1 px-1.5 py-0.5 rounded text-[10px] uppercase font-mono ${
                  isActive
                    ? 'bg-white/20 text-white'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                {tab.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
