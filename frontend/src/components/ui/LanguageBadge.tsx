import React from 'react';
import { TechnologyIcon } from './TechnologyIcon';

export interface LanguageBadgeProps {
  language?: string;
  className?: string;
  size?: 'sm' | 'md';
}

export const LanguageBadge: React.FC<LanguageBadgeProps> = ({
  language,
  className = '',
  size = 'sm',
}) => {
  const clean = (language || 'text').toLowerCase().trim();
  const label = (language || 'PLAINTEXT').toUpperCase();
  const isSmall = size === 'sm';

  return (
    <span
      className={`inline-flex items-center gap-1 font-mono font-semibold rounded border border-[#d5d0c5] bg-[#ebe7dc] text-[#17201d] transition-all select-none ${
        isSmall ? 'text-[11px] px-1.5 py-0.5' : 'text-xs px-2 py-1'
      } ${className}`}
      title={`Language: ${label}`}
    >
      <TechnologyIcon language={clean} size={isSmall ? 10 : 12} className="text-[#74786f]" />
      <span>{label}</span>
    </span>
  );
};