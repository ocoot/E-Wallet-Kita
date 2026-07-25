import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { reportFrontendError } from '../lib/errorReporter';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isRecoveringPassword: boolean;
  setIsRecoveringPassword: (val: boolean) => void;
  signInWithGoogle: () => Promise<void>;
  signInAsGuest: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

// Dipakai baik oleh pengecekan saat SIGNED_IN/INITIAL_SESSION (di bawah)
// maupun oleh listener realtime is_banned (lihat useEffect kedua) --
// keduanya perlu perilaku identik: paksa signOut + tampilkan pesan yang
// sama, cuma dipicu dari titik yang berbeda.
async function signOutForBan() {
  await supabase.auth.signOut();
  const savedLocale = localStorage.getItem("ewallet_language") || "id";
  const banMsg = savedLocale === "id"
    ? "Akun Anda telah ditangguhkan / dilarang. Silakan hubungi admin."
    : "Your account has been suspended / banned. Please contact admin.";
  alert(banMsg);
}

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRecoveringPassword, setIsRecoveringPassword] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      if (event === 'PASSWORD_RECOVERY') {
        setIsRecoveringPassword(true);
      }
      
      // Only sync the `users` row / check ban status on events where the
      // session actually just became active (initial load or a fresh
      // sign-in) — not on every auth state change. Supabase also fires
      // this listener on `TOKEN_REFRESHED`, which happens automatically
      // roughly every hour for as long as the user keeps the app open.
      // Previously the sync block below ran on *every* one of those
      // refreshes too, firing two extra DB round-trips (an upsert plus a
      // ban check) each time, for data that essentially never changes
      // between refreshes.
      const shouldSyncUser = session?.user && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION');

      if (shouldSyncUser) {
        // Sync user record to 'users' table
        try {
          const { data: existingUser } = await supabase
            .from('users')
            .select('display_name')
            .eq('id', session.user.id)
            .maybeSingle();

          const fallbackName =
            session.user.user_metadata?.full_name ||
            session.user.email?.split('@')[0] ||
            (session.user.is_anonymous ? 'Guest' : 'User');

          const { error } = await supabase
            .from('users')
            .upsert({
              id: session.user.id,
              display_name: existingUser?.display_name || fallbackName,
              is_guest: session.user.is_anonymous || false,
              email: session.user.email || null,
              timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
            }, {
              onConflict: 'id',
              ignoreDuplicates: false
            });
          
          if (error) {
            // If it's a guest or something, we might get errors if table doesn't allow upsert 
            // but usually it's fine for public.users
            console.error("AuthContext: user sync error", error);
          }

          // check if user is banned
          const { data: profile } = await supabase
            .from("users")
            .select("is_banned")
            .eq("id", session.user.id)
            .single();

          if (profile?.is_banned) {
            await signOutForBan();
            return;
          }
        } catch (err) {
          console.error("AuthContext: sync exception", err);
          void reportFrontendError({
            source: "frontend:auth",
            message: err instanceof Error ? err.message : String(err),
            context: { action: "post-login-sync", stack: err instanceof Error ? err.stack?.slice(0, 1500) : null },
          });
        }
      }
      
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Root cause / why: pengecekan is_banned di atas HANYA jalan saat
  // SIGNED_IN/INITIAL_SESSION (lihat komentar `shouldSyncUser`) -- artinya
  // kalau admin men-suspend akun ini (AdminUserManager -> admin_set_ban)
  // SEMENTARA sesi ini sudah aktif & terbuka di device tersebut, device
  // itu TIDAK PERNAH tahu sampai user keluar-masuk app lagi (INITIAL_SESSION
  // baru). Dan karena is_banned TIDAK ditegakkan lewat RLS di tabel data
  // manapun (transactions/wallets/dll -- cuma dipakai untuk filter target
  // push notification & tampilan admin panel), sesi yang sudah aktif itu
  // juga TIDAK otomatis kena 403 di request berikutnya seperti yang
  // mungkin diasumsikan -- tanpa listener ini, akun yang di-ban tetap bisa
  // dipakai penuh di device itu tanpa batas waktu.
  //
  // Fix: subscribe realtime ke baris `users` milik SESI INI SENDIRI
  // (filter `id=eq.<uid>`, dan RLS "Users can select their own profile"
  // memberi lapisan kedua yang memastikan channel ini memang cuma bisa
  // menerima perubahan baris milik user yang sedang login, bukan baris
  // user lain). Begitu admin toggle is_banned -> true, event UPDATE masuk
  // di sini secara realtime dan device langsung signOut -- tanpa menunggu
  // request berikutnya atau user membuka ulang app.
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`realtime-own-ban-status-${user.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "users", filter: `id=eq.${user.id}` },
        (payload) => {
          const updated = payload.new as { is_banned?: boolean } | undefined;
          if (updated?.is_banned) {
            void signOutForBan();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  const signInWithGoogle = async () => {
    await supabase.auth.signInWithOAuth({ 
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: {
          access_type: 'offline'
        }
      }
    });
  };

  const signInAsGuest = async () => {
    const { error } = await supabase.auth.signInAnonymously();
    if (error) throw error;
  };

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error("AuthContext: signOut error", err);
      void reportFrontendError({
        source: "frontend:auth",
        message: err instanceof Error ? err.message : String(err),
        context: { action: "signout", stack: err instanceof Error ? err.stack?.slice(0, 1500) : null },
      });
      // Soft-fail SENGAJA: 3 caller signOut() (Settings.tsx, PrivacySettings.tsx,
      // App.tsx) tidak membungkus pemanggilan ini dengan try/catch sendiri --
      // mereka langsung lanjut ke navigate("/login") sesudahnya. Kalau signOut
      // throw di sini, promise itu jadi unhandled rejection dan alur
      // logout/navigasi ke halaman login bisa keputus di tengah jalan.
      // Sesi lokal biasanya sudah dibersihkan oleh Supabase client walau
      // request ke server gagal, jadi lebih aman diam-diam lanjut daripada
      // menjebak user di layar yang sama.
    }
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, isRecoveringPassword, setIsRecoveringPassword, signInWithGoogle, signInAsGuest, signOut }}>
      {/*
        PENTING: dulu ini `{!loading && children}` -- itu artinya SELURUH
        pohon komponen (<App/>, Router, MainLayout, dst) tidak pernah
        di-mount sama sekali selama `loading === true`. Akibatnya baris
        `if (loading) return <SplashScreen />;` di MainLayout (App.tsx)
        adalah dead code: MainLayout sendiri belum ada saat itu, jadi
        SplashScreen TIDAK PERNAH sempat dirender -- apa pun desainnya.
        Yang terlihat sebelumnya cuma <div id="root"></div> kosong
        (putih/kosong polos) sampai sesi Supabase selesai di-resolve,
        lalu app langsung "lompat" muncul penuh.

        Fix: selalu render `children`. `loading` sudah dioper lewat
        context (dipakai oleh App.tsx -> MainLayout) sehingga MainLayout
        yang memutuskan kapan menampilkan <SplashScreen/> -- bukan
        provider ini yang menyembunyikan seluruh app.
      */}
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
