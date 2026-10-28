import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authorProfileApi } from '../api/authorProfileApi';
import '../author-network.css';

export interface FollowButtonProps {
  username: string;
  followed: boolean;
  authenticated: boolean;
  self?: boolean;
  onChange?: (followed: boolean) => void;
  onSignIn?: () => void;
  compact?: boolean;
}

export const FollowButton: React.FC<FollowButtonProps> = ({ username, followed, authenticated, self = false, onChange, onSignIn, compact = false }) => {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const busyRef = React.useRef(false);

  const toggle = async () => {
    if (!authenticated) { if (onSignIn) onSignIn(); else navigate('/login'); return; }
    if (self || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    try {
      if (followed) await authorProfileApi.unfollow(username);
      else await authorProfileApi.follow(username);
      onChange?.(!followed);
    } catch {
      setError('Could not update follow. Try again.');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  if (self) return <span className="developer-follow__self">Your profile</span>;
  return (
    <span className="developer-follow">
      <button type="button" className={`developer-follow__button${followed ? ' is-following' : ''}${compact ? ' is-compact' : ''}`}
        onClick={toggle} disabled={busy} aria-pressed={followed}>
        {busy ? 'Saving…' : followed ? 'Following' : 'Follow'}
      </button>
      {error && <span className="developer-follow__error" role="alert">{error}</span>}
    </span>
  );
};
