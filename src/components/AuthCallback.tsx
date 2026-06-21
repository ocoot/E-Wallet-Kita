import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export const AuthCallback: React.FC = () => {
  const navigate = useNavigate();

  useEffect(() => {
    // IMPORTANT: Do NOT manually call exchangeCodeForSession() here.
    // Supabase's Google OAuth flow completes the code exchange with Google
    // server-side, then redirects back to this app with session tokens
    // already embedded in the URL hash (#access_token=...&refresh_token=...).
    // The Supabase client (initialized with `detectSessionInUrl: true`)
    // automatically parses that hash and establishes the session — no
    // manual exchange step is needed or possible (there is no `code` param
    // to exchange in this flow).
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        navigate('/dashboard', { replace: true });
      } else if (event === 'SIGNED_OUT') {
        navigate('/login', { replace: true });
      }
    });

    // In case the session was already resolved before this effect ran.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        navigate('/dashboard', { replace: true });
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  return <div className="flex items-center justify-center h-screen bg-slate-950 text-white">Completing login...</div>;
};
