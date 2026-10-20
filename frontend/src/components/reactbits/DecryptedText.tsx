import React, { useEffect, useState } from 'react';

interface DecryptedTextProps {
  text: string;
  speed?: number;
  className?: string;
  characters?: string;
}

const DEFAULT_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!<>-_\\/[]{}—=+*^?#________';

export const DecryptedText: React.FC<DecryptedTextProps> = ({
  text,
  speed = 35,
  className = '',
  characters = DEFAULT_CHARS,
}) => {
  const [displayText, setDisplayText] = useState<string>(text);

  useEffect(() => {
    let iteration = 0;
    const totalSteps = text.length;

    const interval = setInterval(() => {
      setDisplayText(
        text
          .split('')
          .map((char, index) => {
            if (char === ' ') return ' ';
            if (index < iteration) {
              return text[index];
            }
            return characters[Math.floor(Math.random() * characters.length)];
          })
          .join('')
      );

      if (iteration >= totalSteps) {
        setDisplayText(text);
        clearInterval(interval);
      }

      iteration += 1;
    }, speed);

    return () => clearInterval(interval);
  }, [text, speed, characters]);

  return <span className={className}>{displayText}</span>;
};
