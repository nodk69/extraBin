import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ApiError } from '../../../lib/api-client/client';
import { Icon } from '../../../components/ui/PaperIcon';

export const RegisterPage: React.FC = () => {
  const navigate = useNavigate();
  const { register, loginWithOAuth } = useAuth();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<'google' | 'github' | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match.');
      return;
    }
    if (password.length < 8) {
      setErrorMessage('Password must be at least 8 characters long.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      await register({
        username: username.trim(),
        email: email.trim(),
        password,
      });
      navigate('/');
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setErrorMessage(err.detail);
      } else if (err instanceof Error) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Failed to create account. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOAuthSignUp = async (provider: 'google' | 'github') => {
    setOauthLoading(provider);
    setErrorMessage(null);
    try {
      await loginWithOAuth(provider);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage(`OAuth ${provider} initiation failed.`);
      }
      setOauthLoading(null);
    }
  };

  return (
    <div className="workspace max-w-lg mx-auto py-12">
      <div className="workspace-heading text-center flex-col items-center justify-center">
        <div className="eyebrow mx-auto justify-center">
          <span></span> NEW ACCOUNT
        </div>
        <h1 className="workbench-title mt-3 text-center text-3xl sm:text-4xl">
          Join extraBin.
        </h1>
        <p className="text-center mt-2">
          Create an account to retain your pastes and manage private keys.
        </p>
      </div>

      <div className="auth-card paper-card mt-6 p-8">
        {errorMessage && (
          <div className="mb-5 p-3 rounded-lg bg-red-100 border border-red-800 text-red-900 text-xs font-mono font-semibold flex items-center justify-between">
            <span>{errorMessage}</span>
            <button onClick={() => setErrorMessage(null)}>&times;</button>
          </div>
        )}

        {/* OAuth Buttons */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <button
            type="button"
            onClick={() => handleOAuthSignUp('google')}
            disabled={!!oauthLoading || isSubmitting}
            className="flex items-center justify-center gap-2.5 py-2.5 px-4 bg-white border border-[#17201d] rounded-lg font-semibold text-xs shadow-[2px_3px_0_#17201d] hover:translate-x-[-1px] hover:translate-y-[-1px] transition-all"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            <span>{oauthLoading === 'google' ? 'Connecting...' : 'Google'}</span>
          </button>

          <button
            type="button"
            onClick={() => handleOAuthSignUp('github')}
            disabled={!!oauthLoading || isSubmitting}
            className="flex items-center justify-center gap-2.5 py-2.5 px-4 bg-[#17201d] text-white border border-[#17201d] rounded-lg font-semibold text-xs shadow-[2px_3px_0_#74776f] hover:translate-x-[-1px] hover:translate-y-[-1px] transition-all"
          >
            <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
              <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
            </svg>
            <span>{oauthLoading === 'github' ? 'Connecting...' : 'GitHub'}</span>
          </button>
        </div>

        <div className="relative flex items-center justify-center mb-6">
          <div className="border-t border-[#d5d0c5] w-full"></div>
          <span className="bg-[#faf8f2] px-3 font-mono text-[11px] text-[#74776f] uppercase tracking-wider absolute">
            or register with email
          </span>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-mono font-bold uppercase tracking-wider text-[#74776f] mb-1.5">
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. dev_coder"
              required
              className="w-full px-3.5 py-2.5 bg-white border border-[#aaa89f] rounded-lg text-sm text-[#17201d] outline-none focus:border-[#17201d]"
            />
          </div>

          <div>
            <label className="block text-xs font-mono font-bold uppercase tracking-wider text-[#74776f] mb-1.5">
              Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@example.com"
              required
              className="w-full px-3.5 py-2.5 bg-white border border-[#aaa89f] rounded-lg text-sm text-[#17201d] outline-none focus:border-[#17201d]"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-mono font-bold uppercase tracking-wider text-[#74776f] mb-1.5">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full px-3.5 py-2.5 bg-white border border-[#aaa89f] rounded-lg text-sm text-[#17201d] outline-none focus:border-[#17201d]"
              />
            </div>
            <div>
              <label className="block text-xs font-mono font-bold uppercase tracking-wider text-[#74776f] mb-1.5">
                Confirm
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full px-3.5 py-2.5 bg-white border border-[#aaa89f] rounded-lg text-sm text-[#17201d] outline-none focus:border-[#17201d]"
              />
            </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="create-button w-full justify-center !gap-4 !h-12 !text-sm"
            >
              <span>{isSubmitting ? 'Creating account...' : 'Create free account'}</span>
              <i className="!w-8 !h-8">
                <Icon name="arrow" size={16} />
              </i>
            </button>
          </div>

          <div className="pt-1 text-center text-xs font-mono text-[#74776f]">
            Already have an account?{' '}
            <Link to="/login" className="font-semibold text-[#17201d] underline">
              Sign in
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
};

export default RegisterPage;
