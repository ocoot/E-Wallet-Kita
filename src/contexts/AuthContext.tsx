import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signInAsGuest: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        // Sync user record to 'users' table
        try {
          const { error } = await supabase
            .from('users')
            .upsert({
              id: session.user.id,
              display_name: session.user.user_metadata?.full_name || session.user.email?.split('@')[0],
              is_guest: session.user.is_anonymous || false
            }, {
              onConflict: 'id',
              ignoreDuplicates: false
            });
          
          if (error) {
            // If it's a guest or something, we might get errors if table doesn't allow upsert 
            // but usually it's fine for public.users
            console.error("AuthContext: user sync error", error);
          }
        } catch (err) {
          console.error("AuthContext: sync exception", err);
        }
      }
      
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signInWithGoogle = async () => {
    await supabase.auth.signInWithOAuth({ 
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: {
          access_type: 'offline',
          prompt: 'consent'
        }
      }
    });
  };

  const signInAsGuest = async () => {
    const { error } = await supabase.auth.signInAnonymously();
    if (error) throw error;
  };

  const signOut = async () => {
      await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signInWithGoogle, signInAsGuest, signOut }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
