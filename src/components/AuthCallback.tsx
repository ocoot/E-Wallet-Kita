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
      addLog(`Hash present: ${!!window.location.hash}`);
      addLog(`Hash excerpt: ${window.location.hash.substring(0, 30)}...`);
      addLog(`LocalStorage Auth Keys: ${Object.keys(localStorage).filter(k => k.includes('auth')).join(', ')}`);

      const { data } = await supabase.auth.getSession();

      if (data.session) {
        addLog('Session found immediately. Redirecting in 2s...');
        setTimeout(() => navigate('/dashboard', { replace: true }), 2000);
        return;
      }

      addLog('No session yet. Waiting 5 seconds for background processing...');
      
      setTimeout(async () => {
        const { data: delayedData } = await supabase.auth.getSession();
        addLog(`Session exists after 5s: ${delayedData.session ? 'YES' : 'NO'}`);
        addLog(`Storage Keys: ${Object.keys(localStorage).join(', ')}`);

        if (delayedData.session) {
          addLog('Session found! Redirecting...');
          setTimeout(() => navigate('/dashboard', { replace: true }), 1500);
        } else {
          addLog('STILL NO SESSION. Failing back to login in 5s...');
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
