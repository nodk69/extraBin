import React from 'react';
import { Loader2 } from 'lucide-react';

export interface PixelButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'green' | 'orange' | 'dark';
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const PixelButton: React.FC<PixelButtonProps> = ({
  children,
  variant = 'green',
  isLoading = false,
  leftIcon,
  rightIcon,
  className = '',
  disabled,
  ...props
}) => {
  const variantClass = {
    green: 'uiverse-pixel-btn',
    orange: 'uiverse-pixel-btn uiverse-pixel-btn-orange',
    dark: 'uiverse-pixel-btn uiverse-pixel-btn-dark',
  }[variant];

  return (
    <button
      disabled={disabled || isLoading}
      className={`${variantClass} ${className}`}
      {...props}
    >
      {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : leftIcon}
      <span>{children}</span>
      {!isLoading && rightIcon}
    </button>
  );
};
