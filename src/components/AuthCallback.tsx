import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export const AuthCallback: React.FC = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const check = async () => {
      console.log('[AuthCallback] Running check...');
      const { data } = await supabase.auth.getSession();

      if (data.session) {
        console.log('[AuthCallback] Session found immediately. Redirecting...');
        navigate('/dashboard', { replace: true });
        return;
      }

      console.log('[AuthCallback] No session yet. Waiting 3 seconds...');
      setTimeout(async () => {
        const { data } = await supabase.auth.getSession();

        if (data.session) {
          console.log('[AuthCallback] Session found after delay. Redirecting...');
          navigate('/dashboard', { replace: true });
        } else {
          console.warn('[AuthCallback] No session found after delay. Failing back to login.');
          navigate('/login', { replace: true });
        }
      }, 3000);
    };

    check();
  }, [navigate]);

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-slate-950 text-white gap-3 p-4">
      <div className="animate-pulse">Completing login...</div>
      <div className="text-slate-500 text-xs">Processing your authentication session</div>
    </div>
  );
};
