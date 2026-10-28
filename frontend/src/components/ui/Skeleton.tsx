import React from 'react';
import './Skeleton.css';

type SkeletonShape = 'block' | 'text' | 'circle' | 'button' | 'badge';

export interface SkeletonProps {
  shape?: SkeletonShape;
  width?: React.CSSProperties['width'];
  height?: React.CSSProperties['height'];
  className?: string;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  shape = 'block',
  width,
  height,
  className = '',
}) => (
  <span
    aria-hidden="true"
    className={`skeleton skeleton--${shape} ${className}`.trim()}
    style={{ width, height }}
  />
);

export const SkeletonText: React.FC<{
  lines?: number;
  widths?: Array<React.CSSProperties['width']>;
  className?: string;
}> = ({ lines = 1, widths = [], className = '' }) => (
  <span className={`skeleton-text ${className}`.trim()} aria-hidden="true">
    {Array.from({ length: lines }, (_, index) => (
      <Skeleton
        key={index}
        shape="text"
        width={widths[index] ?? (index === lines - 1 && lines > 1 ? '72%' : '100%')}
      />
    ))}
  </span>
);

export const SkeletonAvatar: React.FC<{ size?: number; className?: string }> = ({
  size = 44,
  className = '',
}) => <Skeleton shape="circle" width={size} height={size} className={className} />;

export const SkeletonButton: React.FC<{ width?: React.CSSProperties['width']; className?: string }> = ({
  width = 88,
  className = '',
}) => <Skeleton shape="button" width={width} className={className} />;

export const SkeletonBadge: React.FC<{ width?: React.CSSProperties['width']; className?: string }> = ({
  width = 64,
  className = '',
}) => <Skeleton shape="badge" width={width} className={className} />;

export const SkeletonRegion: React.FC<{
  label: string;
  announce?: boolean;
  className?: string;
  testId?: string;
  children: React.ReactNode;
}> = ({ label, announce = true, className = '', testId, children }) => (
  <div
    role={announce ? 'status' : undefined}
    aria-live={announce ? 'polite' : undefined}
    aria-busy="true"
    aria-label={announce ? label : undefined}
    className={`skeleton-region ${className}`.trim()}
    data-testid={testId}
  >
    {announce && <span className="sr-only">{label}</span>}
    <div aria-hidden="true">{children}</div>
  </div>
);
