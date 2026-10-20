import React from 'react';

export interface PixelInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  variant?: 'orange' | 'dark';
}

export const PixelInput: React.FC<PixelInputProps> = ({
  label,
  error,
  variant = 'orange',
  className = '',
  id,
  ...props
}) => {
  return (
    <div className="uiverse-pixel-input-wrapper">
      {label && (
        <label htmlFor={id} className="uiverse-pixel-label">
          &gt; {label}
        </label>
      )}
      <input
        id={id}
        className={`${variant === 'orange' ? 'uiverse-pixel-input' : 'uiverse-pixel-input-dark'} ${className}`}
        {...props}
      />
      {error && (
        <span className="text-xs text-red-400 font-bold tracking-wide [text-shadow:1px_1px_#000]">
          [ERROR: {error}]
        </span>
      )}
    </div>
  );
};
