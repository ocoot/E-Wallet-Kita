import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export const AuthCallback: React.FC = () => {
  const navigate = useNavigate();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const finish = (session: any) => {
      if (!isMounted) return;
      if (session) {
        navigate('/dashboard', { replace: true });
      }
    };

    const run = async () => {
      const code = new URLSearchParams(window.location.search).get('code');
      const hasHashTokens = window.location.hash.includes('access_token');

      // Case 1: PKCE-style return -> we got a ?code= param that must be
      // manually exchanged for a session.
      if (code) {
        const { data, error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          console.error('exchangeCodeForSession error:', error);
          if (isMounted) setErrorMsg(error.message);
          setTimeout(() => navigate('/login', { replace: true }), 2000);
          return;
        }
        finish(data.session);
        return;
      }

      // Case 2: Implicit-style return -> tokens already in the URL hash.
      // The Supabase client (detectSessionInUrl: true) auto-parses this on
      // its own, so we just need to wait for it and read the result.
      if (hasHashTokens) {
        const { data: { session } } = await supabase.auth.getSession();
        finish(session);
        return;
      }

      // Case 3: Neither — maybe session was already established by the time
      // we got here (race with AuthContext's own listener), or genuinely
      // nothing to process.
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        finish(session);
      } else {
        if (isMounted) setErrorMsg('No code or token found in the callback URL.');
        setTimeout(() => navigate('/login', { replace: true }), 2500);
      }
    };

    // Also listen for the async auto-detection in case it resolves slightly
    // later than our manual check above.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        finish(session);
      }
    });

    run();

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [navigate]);

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-slate-950 text-white gap-2">
      <div>Completing login...</div>
      {errorMsg && (
        <div className="text-red-400 text-xs max-w-xs text-center">{errorMsg}</div>
      )}
    </div>
  );
};
