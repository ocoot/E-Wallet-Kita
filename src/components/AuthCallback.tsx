import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Loader2 } from 'lucide-react';

export const AuthCallback: React.FC = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const handleAuthCallback = async () => {
      try {
        const hash = window.location.hash;
        const searchParams = new URLSearchParams(window.location.search);
        const code = searchParams.get('code');
        
        // 1. Check for Access Token in Hash
        if (hash && hash.includes('access_token=')) {
          const params = new URLSearchParams(hash.substring(1));
          const accessToken = params.get('access_token');
          const refreshToken = params.get('refresh_token');
          
          if (accessToken) {
            const { data, error } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken || '',
            });
            
            if (!error && data.session) {
              navigate('/dashboard', { replace: true });
              return;
            }
          }
        } 
        
        // 2. Check for Code in Query (Optional if Supabase is configured for PKCE)
        if (code) {
          const { data, error } = await supabase.auth.exchangeCodeForSession(code);
          if (!error && data.session) {
            navigate('/dashboard', { replace: true });
            return;
          }
        }

        // 3. Last fallback: Check current session
        const { data: sessionData } = await supabase.auth.getSession();
        if (sessionData.session) {
          navigate('/dashboard', { replace: true });
          return;
        }

        // 4. Default to login if nothing works after a short wait
        setTimeout(() => navigate('/login', { replace: true }), 2000);
      } catch (error) {
        console.error('Error during auth callback:', error);
        navigate('/login', { replace: true });
      }
    };

    handleAuthCallback();
  }, [navigate]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 text-white p-6">
      <div className="flex flex-col items-center gap-4 animate-in fade-in duration-700">
        <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
        <div className="text-center space-y-1">
          <h1 className="text-lg font-medium tracking-tight">Finishing up</h1>
          <p className="text-slate-400 text-sm">Synchronizing your financial dashboard...</p>
        </div>
      </div>
    </div>
  );
};
