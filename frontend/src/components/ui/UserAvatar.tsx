import React, { useEffect, useState, useMemo } from 'react';

export interface UserAvatarProps {
  user?: {
    email?: string;
    username?: string;
    avatarUrl?: string | null;
  } | null;
  email?: string;
  username?: string;
  avatarUrl?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | number;
  showStatus?: boolean;
  status?: 'online' | 'offline' | 'away';
  className?: string;
  alt?: string;
}

const SIZE_MAP = {
  xs: { px: 22, text: 'text-[9px]', border: 'border' },
  sm: { px: 28, text: 'text-[11px]', border: 'border' },
  md: { px: 34, text: 'text-xs', border: 'border-[1.5px]' },
  lg: { px: 44, text: 'text-sm', border: 'border-2' },
  xl: { px: 64, text: 'text-lg', border: 'border-2' },
};

// Curated extraBin retro-paper color pairs for procedural avatars
const PALETTES = [
  { bg: '#d1f04b', fg: '#17201d' }, // Acid Lime + Ink
  { bg: '#ff5c3d', fg: '#ffffff' }, // Coral Flame + White
  { bg: '#ebe7dc', fg: '#17201d' }, // Warm Sand + Ink
  { bg: '#17201d', fg: '#d1f04b' }, // Deep Ink + Acid
  { bg: '#38bdf8', fg: '#17201d' }, // Retro Cyan + Ink
  { bg: '#a78bfa', fg: '#17201d' }, // Electric Purple + Ink
];

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

async function computeSha256(str: string): Promise<string> {
  try {
    if (typeof window === 'undefined' || !window.crypto?.subtle) return '';
    const buffer = new TextEncoder().encode(str.trim().toLowerCase());
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('UserAvatar: Failed to compute sha256 hash', err);
    }
    return '';
  }
}

export const UserAvatar: React.FC<UserAvatarProps> = ({
  user,
  email: emailProp,
  username: usernameProp,
  avatarUrl: avatarUrlProp,
  size = 'md',
  showStatus = false,
  status,
  className = '',
  alt,
}) => {
  const email = (user?.email || emailProp || '').trim();
  const username = (user?.username || usernameProp || '').trim();
  const directAvatarUrl = user?.avatarUrl || avatarUrlProp || null;

  const [emailHash, setEmailHash] = useState<string>('');
  const [activeUrlIndex, setActiveUrlIndex] = useState<number>(0);
  const [imageLoaded, setImageLoaded] = useState<boolean>(false);

  // Compute email sha256 for Gravatar asynchronously
  useEffect(() => {
    let isCancelled = false;
    if (email) {
      computeSha256(email).then((hash) => {
        if (!isCancelled) setEmailHash(hash);
      });
    } else {
      setEmailHash('');
    }
    return () => {
      isCancelled = true;
    };
  }, [email]);

  // Reset index ONLY when the input identity changes, NOT on candidateUrls identity changes
  useEffect(() => {
    setActiveUrlIndex(0);
    setImageLoaded(false);
  }, [email, directAvatarUrl]);

  // Candidate sources (OAuth direct URL first, Gravatar second)
  // Note: unavatar.io is intentionally omitted to avoid leaking user emails to third parties
  const candidateUrls = useMemo(() => {
    const urls: string[] = [];
    if (directAvatarUrl) {
      urls.push(directAvatarUrl);
    }
    if (emailHash) {
      urls.push(`https://www.gravatar.com/avatar/${emailHash}?s=200&d=404`);
    }
    return urls;
  }, [directAvatarUrl, emailHash]);

  const isExhausted = activeUrlIndex >= candidateUrls.length;
  const currentUrl = !isExhausted ? candidateUrls[activeUrlIndex] : null;

  const handleImageError = () => {
    setActiveUrlIndex((prev) => Math.min(prev + 1, candidateUrls.length));
  };

  const handleImageLoad = () => {
    setImageLoaded(true);
  };

  // Dimensions & scaling
  const isNumericSize = typeof size === 'number';
  const sizeConfig = isNumericSize
    ? {
        px: size,
        text: '',
        border: size >= 44 ? 'border-2' : 'border-[1.5px]',
      }
    : SIZE_MAP[size] || SIZE_MAP.md;

  const inlineFontSize = isNumericSize
    ? { fontSize: `${Math.max(9, Math.round(sizeConfig.px * 0.38))}px` }
    : undefined;

  // Clean initials extraction (e.g. "john.doe@example.com" -> "JD", "alice smith" -> "AS")
  const initials = useMemo(() => {
    const raw = (username || email || '?').trim();
    if (!raw || raw === '?') return '?';
    const clean = raw.includes('@') ? raw.split('@')[0] : raw;
    const parts = clean.split(/[\s._-]+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return clean.slice(0, 2).toUpperCase() || '?';
  }, [username, email]);

  const palette = useMemo(() => {
    const seed = (email || username || 'extrabin').trim().toLowerCase();
    const idx = hashString(seed) % PALETTES.length;
    return PALETTES[idx];
  }, [email, username]);

  // Status dot
  const hasStatusDot = showStatus || !!status;
  const statusColor =
    status === 'away'
      ? 'bg-[#f59e0b]'
      : status === 'offline'
      ? 'bg-[#94a3b8]'
      : 'bg-[#10b981]'; // default online
  const statusDotSize = sizeConfig.px >= 44 ? 'w-3 h-3' : 'w-2.5 h-2.5';

  return (
    <div
      className={`relative inline-flex items-center justify-center rounded-full shrink-0 select-none ${className}`}
      style={{ width: sizeConfig.px, height: sizeConfig.px }}
      {...(alt ? { title: alt } : {})}
    >
      <div
        className={`relative w-full h-full rounded-full overflow-hidden ${sizeConfig.border} border-[#17201d] shadow-[1.5px_1.5px_0px_#17201d] bg-[#ebe7dc]`}
      >
        {/* Procedural Theme Fallback rendered with absolute positioning to prevent flex fighting */}
        <div
          className={`absolute inset-0 flex items-center justify-center font-mono font-bold tracking-tight ${sizeConfig.text}`}
          style={{
            backgroundColor: palette.bg,
            color: palette.fg,
            ...inlineFontSize,
          }}
          aria-hidden={imageLoaded ? 'true' : undefined}
        >
          <span>{initials}</span>
        </div>

        {/* Profile Image with lazy loading, no-referrer privacy, and absolute overlay */}
        {currentUrl && (
          <img
            key={activeUrlIndex}
            src={currentUrl}
            alt={alt || username || email || 'Avatar'}
            referrerPolicy="no-referrer"
            loading="lazy"
            decoding="async"
            onError={handleImageError}
            onLoad={handleImageLoad}
            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-150 ${
              imageLoaded ? 'opacity-100' : 'opacity-0'
            }`}
          />
        )}
      </div>

      {/* Verified / Online Status Indicator Dot */}
      {hasStatusDot && (
        <span
          className={`absolute bottom-0 right-0 ${statusDotSize} rounded-full ${statusColor} border-[1.5px] border-[#17201d] ring-1 ring-white pointer-events-none`}
          aria-hidden="true"
        />
      )}
    </div>
  );
};
