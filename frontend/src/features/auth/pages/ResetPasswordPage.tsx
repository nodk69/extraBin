import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AlertCircle, CheckCircle2, Loader2, Lock } from 'lucide-react';
import { supabase } from '../../../lib/supabase/client';
import { Button } from '../../../components/ui/Button';

const ResetPasswordPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'ready' | 'updating' | 'success' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  useEffect(() => {
    // Check if we have a valid session from Supabase password reset link
    const checkSession = async () => {
      try {
        const { data: sessionData, error } = await supabase.auth.getSession();
        
        if (error || !sessionData.session) {
          setStatus('error');
          setErrorMessage('Invalid or expired password reset link. Please request a new one.');
          return;
        }

        setStatus('ready');
      } catch (err: any) {
        setStatus('error');
        setErrorMessage(err.message || 'Failed to validate reset link');
      }
    };

    checkSession();
  }, []);

  const handlePasswordUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (newPassword !== confirmPassword) {
      setErrorMessage('Passwords do not match');
      return;
    }
    
    if (newPassword.length < 8) {
      setErrorMessage('Password must be at least 8 characters');
      return;
    }

    setStatus('updating');
    setErrorMessage(null);

    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      
      if (error) throw error;

      setStatus('success');
      setTimeout(() => {
        navigate('/login', { replace: true });
      }, 2000);
    } catch (err: any) {
      setStatus('error');
      setErrorMessage(err.message || 'Failed to update password');
    }
  };

  return (
    <div className="workspace max-w-md mx-auto py-16">
      <div className="paper-card p-8 text-center space-y-6">
        {status === 'loading' && (
          <div className="space-y-5">
            <div className="w-16 h-16 rounded-xl bg-[#c6f05b]/20 border-2 border-[#17201d] text-[#17201d] mx-auto flex items-center justify-center shadow-[3px_3px_0px_#17201d]">
              <Loader2 className="w-8 h-8 animate-spin" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-[#17201d] tracking-tight">Validating Reset Link</h2>
              <p className="text-sm text-[#59615a] mt-2 leading-relaxed">
                Please wait while we verify your password reset link...
              </p>
            </div>
          </div>
        )}

        {status === 'ready' && (
          <form onSubmit={handlePasswordUpdate} className="space-y-5 text-left">
            <div className="text-center">
              <div className="w-16 h-16 rounded-xl bg-[#c6f05b]/20 border-2 border-[#17201d] text-[#17201d] mx-auto flex items-center justify-center shadow-[3px_3px_0px_#17201d]">
                <Lock className="w-8 h-8" />
              </div>
              <h2 className="text-2xl font-bold text-[#17201d] tracking-tight mt-4">Set New Password</h2>
              <p className="text-sm text-[#59615a] mt-2 leading-relaxed">
                Enter your new password below.
              </p>
            </div>

            {errorMessage && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs font-mono font-semibold flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{errorMessage}</span>
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label htmlFor="new-password" className="block text-xs font-bold text-[#17201d] font-mono mb-1">
                  New Password
                </label>
                <input
                  id="new-password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={8}
                  className="w-full px-3 py-2 text-sm font-mono border-2 border-[#17201d] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#c6f05b]"
                  placeholder="At least 8 characters"
                  autoFocus
                />
              </div>

              <div>
                <label htmlFor="confirm-password" className="block text-xs font-bold text-[#17201d] font-mono mb-1">
                  Confirm Password
                </label>
                <input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={8}
                  className="w-full px-3 py-2 text-sm font-mono border-2 border-[#17201d] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#c6f05b]"
                  placeholder="Re-enter your password"
                />
              </div>
            </div>

            <Button
              type="submit"
              variant="primary"
              className="w-full font-bold shadow-[3px_3px_0px_#17201d]"
              disabled={status === 'updating' || !newPassword || !confirmPassword}
            >
              {status === 'updating' ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Updating...
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4 mr-2" />
                  Update Password
                </>
              )}
            </Button>
          </form>
        )}

        {status === 'success' && (
          <div className="space-y-5">
            <div className="w-16 h-16 rounded-xl bg-[#c6f05b]/30 border-2 border-[#17201d] text-[#17201d] mx-auto flex items-center justify-center shadow-[3px_3px_0px_#17201d]">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-[#17201d] tracking-tight">Password Updated!</h2>
              <p className="text-sm text-[#59615a] mt-2 leading-relaxed">
                Your password has been successfully updated. Redirecting to login...
              </p>
            </div>
          </div>
        )}

        {status === 'error' && (
          <div className="space-y-5">
            <div className="w-16 h-16 rounded-xl bg-red-100 border-2 border-red-800 text-red-900 mx-auto flex items-center justify-center shadow-[3px_3px_0px_#991b1b]">
              <AlertCircle className="w-8 h-8" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-[#17201d] tracking-tight">Reset Failed</h2>
              <p className="text-sm text-red-900 mt-2 bg-red-100 p-4 rounded-lg border-2 border-red-800 font-mono font-semibold leading-relaxed">
                {errorMessage}
              </p>
            </div>
            <div className="pt-3 space-y-2">
              <Button
                variant="primary"
                className="w-full font-bold shadow-[3px_3px_0px_#17201d]"
                onClick={() => navigate('/login')}
              >
                Return to Sign In
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ResetPasswordPage;
