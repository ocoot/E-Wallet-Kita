import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export const AuthCallback: React.FC = () => {
  const navigate = useNavigate();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<string[]>([]);

  const log = (msg: string) => {
    console.log('[AuthCallback]', msg);
    setDebugInfo(prev => [...prev, msg]);
  };

  useEffect(() => {
    let isMounted = true;
    let settled = false;

    const finish = (session: any, source: string) => {
      if (!isMounted || settled) return;
      if (session) {
        settled = true;
        log(`Session established via ${source}. Redirecting...`);
        navigate('/dashboard', { replace: true });
      }
    };

    const fail = (msg: string) => {
      if (!isMounted || settled) return;
      settled = true;
      log(`FAILED: ${msg}`);
      setErrorMsg(msg);
      setTimeout(() => navigate('/login', { replace: true }), 4000);
    };

    const run = async () => {
      try {
        const code = new URLSearchParams(window.location.search).get('code');
        const hasHashTokens = window.location.hash.includes('access_token');
        console.log('[AuthCallback] Hash:', window.location.hash);
        log(`code present: ${!!code} | hash tokens: ${hasHashTokens}`);
        if (hasHashTokens) log(`Hash contains: ${window.location.hash.substring(0, 20)}...`);

        if (code) {
          try {
            const { data, error } = await supabase.auth.exchangeCodeForSession(code);
            if (error) {
              fail(`exchangeCodeForSession returned error: ${error.message}`);
              return;
            }
            finish(data.session, 'exchangeCodeForSession');
            return;
          } catch (e: any) {
            fail(`exchangeCodeForSession threw: ${e?.message || String(e)}`);
            return;
          }
        }

        // No code in query — check if session already exists (hash flow
        // already auto-processed by detectSessionInUrl, or race with
        // AuthContext's listener).
        try {
          const { data: { session }, error } = await supabase.auth.getSession();
          if (error) {
            log(`getSession error (non-fatal): ${error.message}`);
          }
          if (session) {
            finish(session, 'getSession');
            return;
          }
        } catch (e: any) {
          log(`getSession threw: ${e?.message || String(e)}`);
        }

        // Nothing worked yet — give the async onAuthStateChange listener a
        // few seconds to fire before declaring failure.
        setTimeout(() => {
          if (!settled) {
            fail('Timed out: no code, no hash session, no auth event after 6s.');
          }
        }, 6000);
      } catch (e: any) {
        fail(`Unexpected error in run(): ${e?.message || String(e)}`);
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      log(`onAuthStateChange: ${event}`);
      if (event === 'SIGNED_IN' && session) {
        finish(session, 'onAuthStateChange');
      }
    });

    run();

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [navigate]);

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-slate-950 text-white gap-3 p-4">
      <div>Completing login...</div>
      {errorMsg && (
        <div className="text-red-400 text-xs max-w-sm text-center border border-red-800 rounded p-2 bg-red-950/30">
          {errorMsg}
        </div>
      )}
      <div className="bg-black text-green-400 p-3 rounded w-full max-w-md font-mono text-[10px] overflow-auto max-h-64 border border-green-800">
        {debugInfo.length === 0 && <div className="text-slate-500">Waiting...</div>}
        {debugInfo.map((d, i) => <div key={i} className="break-all">{'>'} {d}</div>)}
      </div>
    </div>
  );
};
