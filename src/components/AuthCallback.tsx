import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export const AuthCallback: React.FC = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const handleCallback = async () => {
      const { error } = await supabase.auth.exchangeCodeForSession(
        new URLSearchParams(window.location.search).get('code') || ''
      );
      if (error) {
        console.error('Callback error:', error);
        navigate('/login');
      } else {
        navigate('/dashboard');
      }
    };

    handleCallback();
  }, [navigate]);

  return <div className="flex items-center justify-center h-screen bg-slate-950 text-white">Completing login...</div>;
};
