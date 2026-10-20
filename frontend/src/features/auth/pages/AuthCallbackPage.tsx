import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, CheckCircle2, Loader2, LogIn } from 'lucide-react';
import { supabase } from '../../../lib/supabase/client';
import { useAuth } from '../context/AuthContext';
import { Button } from '../../../components/ui/Button';

const AuthCallbackPage: React.FC = () => {
  const navigate = useNavigate();
  const { syncSessionWithBackend } = useAuth();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;

    const processOAuthCallback = async () => {
      try {
        // Allow Supabase client to parse URL hash or code exchange
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError) {
          throw sessionError;
        }

        let activeSession = sessionData.session;

        // If not immediately available, wait briefly or listen for state change
        if (!activeSession) {
          const sessionPromise = new Promise<any>((resolve, reject) => {
            const timeout = setTimeout(() => {
              reject(new Error('OAuth session exchange timed out. Please try signing in again.'));
            }, 8000);

            const { data: authSub } = supabase.auth.onAuthStateChange((_event, session) => {
              if (session) {
                clearTimeout(timeout);
                authSub.subscription.unsubscribe();
                resolve(session);
              }
            });
          });

          activeSession = await sessionPromise;
        }

        if (activeSession?.user?.email && activeSession.access_token) {
          const userMetadata = activeSession.user.user_metadata || {};
          const displayName = userMetadata.full_name || userMetadata.name || userMetadata.user_name || userMetadata.username;

          const avatarUrl = userMetadata.avatar_url || userMetadata.picture || null;

          await syncSessionWithBackend(
            activeSession.access_token,
            activeSession.user.email,
            displayName,
            avatarUrl
          );

          if (!isCancelled) {
            setStatus('success');
            setTimeout(() => {
              navigate('/account', { replace: true });
            }, 800);
          }
        } else {
          throw new Error('No verified user email found in OAuth response.');
        }
      } catch (err: any) {
        if (!isCancelled) {
          setStatus('error');
          setErrorMessage(err.message || 'Failed to authenticate with OAuth provider.');
        }
      }
    };

    processOAuthCallback();

    return () => {
      isCancelled = true;
    };
  }, [navigate, syncSessionWithBackend]);

  return (
    <div className="workspace max-w-md mx-auto py-16">
      <div className="paper-card p-8 text-center space-y-6">
        {status === 'loading' && (
          <div className="space-y-5">
            <div className="w-16 h-16 rounded-xl bg-[#c6f05b]/20 border-2 border-[#17201d] text-[#17201d] mx-auto flex items-center justify-center shadow-[3px_3px_0px_#17201d]">
              <Loader2 className="w-8 h-8 animate-spin" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-[#17201d] tracking-tight">Authenticating with OAuth2</h2>
              <p className="text-sm text-[#59615a] mt-2 leading-relaxed">
                Verifying your credentials and synchronizing with your extraBin profile...
              </p>
            </div>
          </div>
        )}

        {status === 'success' && (
          <div className="space-y-5">
            <div className="w-16 h-16 rounded-xl bg-[#c6f05b]/30 border-2 border-[#17201d] text-[#17201d] mx-auto flex items-center justify-center shadow-[3px_3px_0px_#17201d]">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-[#17201d] tracking-tight">Authentication Successful!</h2>
              <p className="text-sm text-[#59615a] mt-2 leading-relaxed">
                Welcome back. Redirecting you to your account dashboard...
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
              <h2 className="text-2xl font-bold text-[#17201d] tracking-tight">OAuth Sign-In Failed</h2>
              <p className="text-sm text-red-900 mt-2 bg-red-100 p-4 rounded-lg border-2 border-red-800 font-mono font-semibold leading-relaxed">
                {errorMessage}
              </p>
            </div>
            <div className="pt-3">
              <Button
                variant="primary"
                className="w-full font-bold shadow-[3px_3px_0px_#17201d]"
                onClick={() => navigate('/login')}
              >
                <LogIn className="w-4 h-4 mr-2" />
                Return to Sign In
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AuthCallbackPage;
