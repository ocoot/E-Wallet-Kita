import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { reportFrontendError } from '../lib/errorReporter';
import { Loader2 } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

/**
 * Navigasi ke dashboard setelah login berhasil.
 *
 * SENGAJA pakai hard navigation (`window.location.replace`), BUKAN
 * `navigate()` dari react-router (soft SPA navigation). Alasan:
 *
 * Setelah redirect balik dari OAuth Google (browser/WebView eksternal ->
 * kembali ke PWA), pada sebagian device layout viewport yang dipakai
 * browser untuk pertama kali masih memakai ukuran lama (kadang lebih
 * lebar, membuat breakpoint `lg:` di seluruh app -- lihat
 * useIsDesktopViewport.ts, Sidebar.tsx, MobileBottomNav.tsx -- salah
 * kebaca sebagai desktop) sampai ada reload penuh yang memaksa browser
 * menghitung ulang viewport dari awal. Soft navigate TIDAK memicu
 * penghitungan ulang ini karena document yang sama tetap dipakai apa
 * adanya, makanya sebelumnya user harus refresh manual supaya kembali ke
 * tampilan mobile. Dispatch `resize` event sintetis (versi sebelumnya)
 * juga tidak menolong karena `matchMedia` hanya re-evaluate saat lebar
 * viewport ASLI berubah, bukan dari event tiruan.
 *
 * `window.location.replace` mereplikasi persis efek refresh manual
 * (full reload, tanpa menambah entry baru di history) sehingga masalah
 * ini teratasi tanpa perlu campur tangan user.
 */
const goToDashboard = () => {
  window.location.replace('/dashboard');
};

export const AuthCallback: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useLanguage();

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
              goToDashboard();
              return;
            }
          }
        } 
        
        // 2. Check for Code in Query (Optional if Supabase is configured for PKCE)
        if (code) {
          const { data, error } = await supabase.auth.exchangeCodeForSession(code);
          if (!error && data.session) {
            goToDashboard();
            return;
          }
        }

        // 3. Last fallback: Check current session
        const { data: sessionData } = await supabase.auth.getSession();
        if (sessionData.session) {
          goToDashboard();
          return;
        }

        // 4. Default to login if nothing works after a short wait
        setTimeout(() => navigate('/login', { replace: true }), 2000);
      } catch (error) {
        console.error('Error during auth callback:', error);
        void reportFrontendError({
          source: "frontend:auth",
          message: error instanceof Error ? error.message : String(error),
          context: { action: "oauth-callback", stack: error instanceof Error ? error.stack?.slice(0, 1500) : null },
        });
        navigate('/login', { replace: true });
      }
    };

    handleAuthCallback();
  }, [navigate]);

  return (
    <div className="flex flex-col items-center justify-center min-h-dvh bg-slate-950 text-white p-6">
      <div className="flex flex-col items-center gap-4 animate-in fade-in duration-700">
        <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
        <div className="text-center space-y-1">
          <h1 className="text-lg font-medium tracking-tight">{t("auth.finishing_up")}</h1>
          <p className="text-slate-400 text-sm">{t("auth.sync_dashboard")}</p>
        </div>
      </div>
    </div>
  );
};
