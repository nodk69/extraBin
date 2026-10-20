import React from 'react';
import { Loader2 } from 'lucide-react';
import { Icon } from './PaperIcon';

export interface LoadingProps {
  /** The primary loading message */
  message?: string;
  /** Optional secondary subtitle or detail */
  submessage?: string;
  /**
   * Layout presentation:
   * - 'page': Fullscreen / workspace page center with prominent spinner & title
   * - 'card': Contained in a bordered paper card with padding
   * - 'inline': Compact horizontal row with status dot or spinner
   * - 'minimal': Just the icon/spinner without text
   */
  variant?: 'page' | 'card' | 'inline' | 'minimal';
  /** Spinner size */
  size?: 'sm' | 'md' | 'lg';
  /** Icon style */
  icon?: 'spark' | 'loader' | 'dot';
  /** Additional CSS class names */
  className?: string;
  /**
   * Expose the indicator as an ARIA `status` live region.
   *
   * A page that owns a single status region for outcome announcements (the
   * paste view announces clipboard and download results there) turns this off
   * for nested loading indicators: two competing `status` regions force
   * assistive technology — and every test that queries the page status — to
   * guess which one carries the message. The text stays announced through
   * `aria-live` in that case.
   */
  announce?: boolean;
}

export const Loading: React.FC<LoadingProps> = ({
  message = 'Loading...',
  submessage,
  variant = 'page',
  size = 'md',
  icon = 'spark',
  className = '',
  announce = true,
}) => {
  const iconPixelSize = size === 'lg' ? 32 : size === 'sm' ? 16 : 24;

  const liveProps: {
    role?: 'status';
    'aria-live'?: 'polite';
    'aria-busy'?: boolean;
  } = announce
    ? { role: 'status', 'aria-live': 'polite' }
    : { 'aria-live': 'polite', 'aria-busy': true };

  const renderIcon = () => {
    if (icon === 'loader') {
      return (
        <Loader2
          className={`animate-spin text-[#ff5c3d] ${size === 'lg' ? 'w-8 h-8' : size === 'sm' ? 'w-4 h-4' : 'w-6 h-6'}`}
        />
      );
    }
    if (icon === 'dot') {
      return <span className="status-dot animate-pulse shrink-0" />;
    }
    return (
      <div className="animate-spin text-[#ff5c3d]">
        <Icon name="spark" size={iconPixelSize} />
      </div>
    );
  };

  if (variant === 'minimal') {
    return (
      <div
        {...liveProps}
        className={`inline-flex items-center justify-center ${className}`}
      >
        {renderIcon()}
        <span className="sr-only">{message}</span>
      </div>
    );
  }

  if (variant === 'inline') {
    return (
      <div
        {...liveProps}
        className={`inline-flex items-center gap-2 font-mono text-xs text-[#74786f] ${className}`}
      >
        {renderIcon()}
        <span>{message}</span>
      </div>
    );
  }

  if (variant === 'card') {
    return (
      <div
        {...liveProps}
        className={`account-table-card p-12 sm:p-16 text-center flex flex-col items-center justify-center gap-3 ${className}`}
      >
        {renderIcon()}
        {message && (
          <div className="font-mono text-xs text-[#74786f] uppercase tracking-wider">
            {message}
          </div>
        )}
        {submessage && (
          <div className="font-mono text-[11px] text-[#74786f]/70 max-w-sm">
            {submessage}
          </div>
        )}
      </div>
    );
  }

  // Default: 'page'
  return (
    <div
      {...liveProps}
      className={`workspace flex flex-col items-center justify-center min-h-[50vh] gap-3 text-center ${className}`}
    >
      {renderIcon()}
      {message && (
        <p className="text-sm font-mono text-[#74776f] m-0">
          {message}
        </p>
      )}
      {submessage && (
        <p className="text-xs font-mono text-[#74786f]/70 max-w-xs m-0">
          {submessage}
        </p>
      )}
    </div>
  );
};

export default Loading;
