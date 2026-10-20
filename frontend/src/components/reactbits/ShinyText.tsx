import React from 'react';

interface ShinyTextProps {
  children?: React.ReactNode;
  text?: string;
  className?: string;
}

export const ShinyText: React.FC<ShinyTextProps> = ({
  children,
  text,
  className = '',
}) => {
  const content = text || children;
  return (
    <span
      className={`relative inline-block font-medium bg-[linear-gradient(110deg,#cbd5e1,35%,#ffffff,50%,#cbd5e1,65%)] bg-[length:200%_100%] bg-clip-text text-transparent animate-shiny-shimmer ${className}`}
    >
      {content}
    </span>
  );
};
