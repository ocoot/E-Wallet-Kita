import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export const AuthCallback: React.FC = () => {
  const navigate = useNavigate();
  const [debugLogs, setDebugLogs] = useState<string[]>([]);

  const addLog = (msg: string) => {
    console.log(`[AuthCallback] ${msg}`);
    setDebugLogs(prev => [...prev, `${new Date().toLocaleTimeString()}: ${msg}`]);
  };

  useEffect(() => {
    const check = async () => {
      addLog('Running check...');
      const hash = window.location.hash;
      addLog(`Hash present: ${!!hash}`);
      
      if (hash && hash.includes('access_token=')) {
        addLog('OAuth token detected in hash. Attempting manual forced parse...');
        try {
          const params = new URLSearchParams(hash.substring(1));
          const accessToken = params.get('access_token');
          const refreshToken = params.get('refresh_token');
          
          if (accessToken) {
            addLog(`Found access_token. Refresh token: ${!!refreshToken}`);
            addLog('Forcing setSession...');
            
            const { data: setData, error: setError } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken || '',
            });
            
            if (setError) {
              addLog(`CRITICAL setSession Error: ${setError.message}`);
              console.error('[AuthCallback] setSession failed:', setError);
            } else if (setData.session) {
              addLog(`Session FORCED! User: ${setData.session.user?.email}`);
              addLog(`New Storage Keys: ${Object.keys(localStorage).filter(k => k.includes('auth')).join(', ')}`);
              addLog('Redirecting to dashboard...');
              setTimeout(() => navigate('/dashboard', { replace: true }), 1500);
              return;
            } else {
              addLog('setSession returned NO session and NO error. Very strange.');
            }
          } else {
            addLog('No access_token found in hash parameters.');
          }
        } catch (e: any) {
          addLog(`Manual parse error: ${e.message}`);
        }
      }

      addLog(`LocalStorage Auth Keys: ${Object.keys(localStorage).filter(k => k.includes('auth')).join(', ')}`);

      const { data } = await supabase.auth.getSession();
      if (data.session) {
        addLog('Session found via getSession. Redirecting...');
        setTimeout(() => navigate('/dashboard', { replace: true }), 1000);
        return;
      }

      addLog('No session yet. Waiting for background processing or events...');
      
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
        addLog(`Auth Event: ${event}`);
        if (session) {
          addLog('Session received via event! Redirecting...');
          subscription.unsubscribe();
          setTimeout(() => navigate('/dashboard', { replace: true }), 1000);
        }
      });

      setTimeout(async () => {
        const { data: delayedData } = await supabase.auth.getSession();
        addLog(`Session exists after 5s: ${delayedData.session ? 'YES' : 'NO'}`);
        
        if (delayedData.session) {
          addLog('Session found! Redirecting...');
          subscription.unsubscribe();
          setTimeout(() => navigate('/dashboard', { replace: true }), 1000);
        } else {
          addLog('STILL NO SESSION. Checking for "code" in URL...');
          const code = new URLSearchParams(window.location.search).get('code');
          if (code) {
             addLog('Found "code" param. Manually exchanging...');
             const { data: exchangeData, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
             if (exchangeError) {
                addLog(`Exchange Error: ${exchangeError.message}`);
             } else if (exchangeData.session) {
                addLog('Exchange Success! Redirecting...');
                subscription.unsubscribe();
                setTimeout(() => navigate('/dashboard', { replace: true }), 1000);
                return;
             }
          }
          
          addLog('FATAL: Authentication failed. Returning to login in 5s...');
          subscription.unsubscribe();
          setTimeout(() => navigate('/login', { replace: true }), 5000);
        }
      }, 5000);
    };

    check();
  }, [navigate]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 text-white gap-4 p-6">
      <div className="flex items-center gap-3">
        <div className="w-4 h-4 rounded-full bg-blue-500 animate-ping" />
        <h1 className="font-medium">Completing Authentication...</h1>
      </div>
      
      <div className="w-full max-w-md bg-black/50 border border-slate-800 rounded-lg p-4 font-mono text-[10px] space-y-1 overflow-auto max-h-[60vh]">
        <div className="text-slate-500 border-b border-slate-800 pb-2 mb-2">DEBUG CONSOLE</div>
        {debugLogs.map((log, i) => (
          <div key={i} className="break-all border-b border-slate-900/50 pb-1">
            <span className="text-blue-400">$</span> {log}
          </div>
        ))}
      </div>
      
      <p className="text-slate-500 text-xs text-center">
        If you are stuck here, please screenshot this screen.
      </p>
    </div>
  );
};
