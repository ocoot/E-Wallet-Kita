import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export const AuthCallback: React.FC = () => {
  const navigate = useNavigate();
  const [logs, setLogs] = useState<string[]>([]);
  const addLog = (msg: string) => setLogs(prev => [...prev, msg]);

  useEffect(() => {
    const handleCallback = async () => {
      const code = new URLSearchParams(window.location.search).get('code');
      addLog(`URL Param 'code': ${!!code ? 'Found' : 'Missing'}`);
      
      if (!code) {
        addLog('Error: No code found in URL');
        return;
      }

      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      
      if (error) {
        addLog(`Exchange Error: ${error.message}`);
        console.error('Callback error:', error);
      } else {
        addLog('Session Exchange Success');
        navigate('/dashboard');
      }
    };

    handleCallback();
  }, [navigate]);

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-slate-950 text-white p-4">
      <div className="mb-4">Completing login...</div>
      <div className="bg-black text-green-400 p-4 rounded w-full max-w-md font-mono text-xs overflow-auto h-64 border border-green-800">
        <h2 className="font-bold border-b border-green-800 mb-2">DEBUG LOGS</h2>
        {logs.map((log, i) => <div key={i}>{'>'} {log}</div>)}
      </div>
    </div>
  );
};
