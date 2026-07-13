import React, { useState, useEffect, useRef, Suspense, lazy } from "react";
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { LanguageProvider, useLanguage } from "./contexts/LanguageContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import { ToastProvider, useToast } from "./contexts/ToastContext";
import { MaintenanceProvider } from "./contexts/MaintenanceContext";
import { CategoriesProvider } from "./contexts/CategoriesContext";
import { BalanceVisibilityProvider } from "./contexts/BalanceVisibilityContext";
import { AdminProvider } from "./contexts/AdminContext";
import { useAuth } from "./contexts/AuthContext";
import { usePremium } from "./hooks/usePremium";
import { Sidebar } from "./components/Sidebar";
import { MobileBottomNav } from "./components/MobileBottomNav";
import { MobileTopBar } from "./components/MobileTopBar";
import { Login } from "./views/Login";
import { AuthCallback } from "./components/AuthCallback";
import { Onboarding } from "./views/Onboarding";
import { useAdmin } from "./hooks/useAdmin";
import { Modal } from "./components/Modal";
import { ResetPasswordModal } from "./components/ResetPasswordModal";
import { MaintenanceBanner } from "./components/MaintenanceBanner";
import { OfflineBanner } from "./components/OfflineBanner";
import { FeatureLockGate } from "./components/FeatureLockGate";
import { SupportChatWidget } from "./components/SupportChatWidget";
import { UpdatePrompt } from "./components/UpdatePrompt";
import { UpdateCheckingIndicator } from "./components/UpdateCheckingIndicator";
import { Breadcrumbs } from "./components/Breadcrumbs";
import {
  DashboardSkeleton,
  HistorySkeleton,
  TransactionSkeleton,
  BudgetSkeleton,
  SettingsSkeleton,
  BillRemindersSkeleton,
  AdminSkeleton,
  DefaultSkeleton,
} from "./components/SkeletonLoader";
import { motion, AnimatePresence } from "motion/react";
import logoUrl from "./assets/images/user_logo_transparent.png";
import { supabase } from "./lib/supabase";
import { requestFcmToken, saveFcmToken, clearFcmToken } from "./lib/firebase";
import { User } from "@supabase/supabase-js";

// Code-split the heavier views instead of bundling them all into the main
// chunk. AdminPanel in particular (broadcast tools, voucher manager, AI
// monitor, category manager, etc.) used to ship to every single user on
// first load even though only a handful of admins ever open it. Each view
// below is now its own chunk, fetched on demand the first time its route
// is visited, instead of every view loading eagerly for every user.
const Dashboard = lazy(() => import("./views/Dashboard").then(m => ({ default: m.Dashboard })));
const NewTransaction = lazy(() => import("./views/NewTransaction").then(m => ({ default: m.NewTransaction })));
const History = lazy(() => import("./views/History").then(m => ({ default: m.History })));
const Settings = lazy(() => import("./views/Settings").then(m => ({ default: m.Settings })));
const Budget = lazy(() => import("./views/Budget").then(m => ({ default: m.Budget })));
const Wallets = lazy(() => import("./views/Wallets").then(m => ({ default: m.Wallets })));
const BillReminders = lazy(() => import("./views/BillReminders").then(m => ({ default: m.BillReminders })));
const Installments = lazy(() => import("./views/Installments").then(m => ({ default: m.Installments })));
const Savings = lazy(() => import("./views/Savings").then(m => ({ default: m.Savings })));
const GoldSavings = lazy(() => import("./views/GoldSavings").then(m => ({ default: m.GoldSavings })));
const AdminPanel = lazy(() => import("./views/AdminPanel").then(m => ({ default: m.AdminPanel })));

function RouteFallback() {
  // We can't call useLocation() here since Suspense boundary may trigger
  // before location is available. Use a simple shimmer instead.
  return <DefaultSkeleton />;
}

/** Pick a skeleton by matching the current pathname. Must be used inside the Routes component. */
function SkeletonByRoute() {
  // This component must be inside the Suspense so useLocation works
  const loc = typeof window !== "undefined" ? window.location.pathname : "/dashboard";
  if (loc.startsWith("/transactions/new")) return <TransactionSkeleton />;
  if (loc.startsWith("/transactions"))     return <HistorySkeleton />;
  if (loc.startsWith("/budget"))           return <BudgetSkeleton />;
  if (loc.startsWith("/bill-reminders"))   return <BillRemindersSkeleton />;
  if (loc.startsWith("/installments"))     return <BillRemindersSkeleton />;
  if (loc.startsWith("/savings"))          return <BillRemindersSkeleton />;
  if (loc.startsWith("/gold-savings"))     return <BillRemindersSkeleton />;
  if (loc.startsWith("/settings"))         return <SettingsSkeleton />;
  if (loc.startsWith("/admin"))            return <AdminSkeleton />;
  if (loc === "/onboarding")               return <DefaultSkeleton />;
  return <DashboardSkeleton />;
}

interface MainLayoutProps {
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const MainLayout: React.FC<MainLayoutProps> = ({ user, loading, signOut }) => {
  const { isAdmin, loading: adminLoading } = useAdmin();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { t } = useLanguage();
  
  const [userProfile, setUserProfile] = useState<{ display_name: string } | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [transactionsUpdatedTrigger, setTransactionsUpdatedTrigger] = useState(0);
  const lastRealtimeId = useRef<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const fetchProfile = async () => {
      const { data, error } = await supabase
        .from("users")
        .select("display_name")
        .eq("id", user.id)
        .single();
      if (!error && data) {
        setUserProfile(data);
      }
    };
    fetchProfile();
  }, [user]);

  const handleTransactionChange = () => {
    setTransactionsUpdatedTrigger(prev => prev + 1);
  };

  // ── FCM: Register push token after login ───────────────────────────
  // Depends on user?.id (not the whole `user` object) on purpose: Supabase
  // replaces the `user` object with a new reference on every
  // TOKEN_REFRESHED auth event (roughly hourly, whenever the access token
  // auto-refreshes), even though it's still the same account. Depending on
  // the whole object re-ran this effect on every token refresh, calling
  // requestFcmToken() far more often than intended — combined with the
  // in-memory token cache being relied on as the only de-dup mechanism,
  // this was a contributing factor to token churn / duplicate device rows.
  useEffect(() => {
    if (!user) return;
    const setupFcm = async () => {
      const token = await requestFcmToken();
      if (token) {
        await saveFcmToken(supabase, user.id, token);
      }
    };
    setupFcm();
  }, [user?.id]);

  // ── FCM: Show foreground message as toast ──────────────────────────
  useEffect(() => {
    const handler = (e: Event) => {
      const { title, body } = (e as CustomEvent).detail;
      if (title || body) {
        showToast(`${title}: ${body}`, "info");
      }
    };
    window.addEventListener("fcm-foreground-message", handler);
    return () => window.removeEventListener("fcm-foreground-message", handler);
  }, [showToast]);

  const { isPremium, loading: premiumLoading } = usePremium();

  // Real-time listen to user's database change events on the transactions table
  useEffect(() => {
    if (!user) return;

    const transactionChannel = supabase
      .channel(`realtime-transactions-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "transactions",
          filter: `user_id=eq.${user.id}`
        },
        (payload: any) => {
          setTransactionsUpdatedTrigger(prev => prev + 1);

          if (payload.eventType === "INSERT") {
            const tx = payload.new;
            if (tx && tx.id) {
              const isLocalOrigin = (window as any).lastSavedTransactionId === tx.id;
              const isDuplicate = lastRealtimeId.current === tx.id;

              if (!isLocalOrigin && !isDuplicate) {
                lastRealtimeId.current = tx.id;
                
                if (tx.source === "telegram") {
                  showToast(t("toast.realtime_success_telegram"), "success");
                } else {
                  showToast(t("toast.realtime_success_general"), "success");
                }
              }
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(transactionChannel);
    };
  }, [user, t, showToast]);

  // Real-time "new voucher available" notification — only relevant to
  // users who aren't premium yet, since premium users have nothing to
  // claim a discount voucher for. Every user used to open this WebSocket
  // channel regardless of premium status, which meant a permanently-open
  // realtime connection that almost all premium users would never get any
  // use out of. We wait for `premiumLoading` to resolve before deciding,
  // so we don't briefly subscribe-then-unsubscribe on every page load.
  useEffect(() => {
    if (!user || premiumLoading || isPremium) return;

    const voucherChannel = supabase
      .channel("premium-voucher")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "premium_vouchers" },
        (payload: any) => {
          if (payload.new && payload.new.is_active) {
            showToast(t("voucher.new_available"), "info");
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(voucherChannel);
    };
  }, [user, premiumLoading, isPremium, t, showToast]);
  
  // Signout prompt control triggers
  const [isSignoutModalOpen, setIsSignoutModalOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);


  const handleLogoutClick = () => {
    setIsSignoutModalOpen(true);
  };

  const executeSignout = async () => {
    setIsSignoutModalOpen(false);
    setIsLoggingOut(true);

    try {
      // Must run BEFORE signOut() while we still have user.id, and before
      // the Supabase session/JWT is invalidated (the delete below relies
      // on the RLS policy "user_id = auth.uid()" still matching).
      if (user) {
        await clearFcmToken(supabase, user.id);
      }
      await signOut();
      navigate('/login');
      showToast(t("toast.logout_done"), "success");
    } catch (e: any) {
      showToast(e.message, "error");
    } finally {
      setIsLoggingOut(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white">
        Loading...
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="relative min-h-screen flex flex-col md:flex-row bg-slate-950 text-white transition-colors duration-300 light_sakura:bg-rose-50/20 light_sakura:text-slate-800">

      {/* Ambient background orbs -- lapisan dekoratif statis (blur besar,
          warna lembut) yang sengaja diletakkan di belakang seluruh layout
          (-z-10) supaya efek glassmorphism pada Sidebar & MobileBottomNav
          (bg tembus pandang + backdrop-blur) punya sesuatu yang terlihat
          "melebur" di baliknya alih-alih menyamar dengan warna solid datar.
          Murni dekoratif -- aria-hidden & pointer-events-none. */}
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden="true">
        <div className="absolute -top-32 -left-24 w-[28rem] h-[28rem] rounded-full bg-indigo-600/25 blur-[110px] light_sakura:bg-rose-300/30" />
        <div className="absolute top-1/3 -right-32 w-[26rem] h-[26rem] rounded-full bg-violet-600/20 blur-[110px] light_sakura:bg-sky-200/25" />
        <div className="absolute bottom-0 left-1/4 w-[24rem] h-[24rem] rounded-full bg-indigo-500/15 blur-[110px] light_sakura:bg-violet-200/20" />
      </div>

      {/*Subtle noise/grain overlay for surface texture */}
      <div className="noise-overlay" />

      {/* Banner status koneksi -- muncul di atas seluruh layout, termasuk saat modal terbuka */}
      <OfflineBanner />

      {/* Sidebar desktop (persisten, dapat dilipat) -- hanya tampil di layar >= md */}
      <Sidebar
        onLogoutClick={handleLogoutClick}
        isCollapsed={isSidebarCollapsed}
        onToggle={setIsSidebarCollapsed}
        userDisplayName={userProfile?.display_name}
      />

      {/* Navbar bawah -- menggantikan sidebar di layar handphone (< md) */}
      <MobileBottomNav
        onLogoutClick={handleLogoutClick}
        userDisplayName={userProfile?.display_name}
      />

      {/* Header khusus tampilan handphone -- SENGAJA diletakkan di sini,
          sebagai saudara (sibling) dari <main>, BUKAN di dalamnya. <main> di
          bawah punya class overflow-y-auto; kalau header sticky ditaruh di
          DALAM elemen yang overflow-nya bukan "visible", browser menjadikan
          elemen itu sebagai acuan scroll untuk posisi sticky -- padahal
          <main> sendiri tidak pernah benar-benar men-scroll secara internal
          (tingginya cuma min-h-screen, tidak dibatasi), jadi yang scroll
          sesungguhnya adalah dokumen/window. Akibatnya sticky yang dihitung
          relatif ke <main> malah ikut "terbawa" scroll dan headernya
          hilang. Dengan diletakkan di sini (ancestor-nya tidak ada yang
          overflow selain visible), sticky dihitung relatif ke window,
          persis seperti header mobile versi lama sebelum navbar bawah ada. */}
      <MobileTopBar />

      {/* Main active subview frame */}
      <main className={`flex-1 min-h-screen overflow-y-auto w-full transition-all duration-300 ${isSidebarCollapsed ? 'md:pl-20' : 'md:pl-64'}`}>
        {/* Running text maintenance banner, shown globally above all pages */}
        <MaintenanceBanner />

        {/* pb-24: ruang aman di bawah supaya konten tidak tertutup navbar
            bawah mobile; md:pb-40 mengembalikan spasi asli di layar desktop
            (yang tidak punya navbar bawah). */}
        <div className="p-4 sm:p-6 lg:p-8 pb-24 md:pb-40">
          <div className="max-w-7xl mx-auto w-full">
            <Breadcrumbs />
            <AnimatePresence mode="wait">
              <Suspense fallback={<SkeletonByRoute />}>
                <Routes>
                  <Route path="/dashboard" element={<Dashboard transactionsUpdatedTrigger={transactionsUpdatedTrigger} onTransactionAdded={handleTransactionChange} userDisplayName={userProfile?.display_name} />} />
                  <Route path="/transactions/new" element={<FeatureLockGate featureKey="new_transaction"><NewTransaction onTransactionAdded={handleTransactionChange} userDisplayName={userProfile?.display_name} /></FeatureLockGate>} />
                  <Route path="/transactions" element={<FeatureLockGate featureKey="history"><History transactionsUpdatedTrigger={transactionsUpdatedTrigger} onTransactionUpdated={handleTransactionChange} userDisplayName={userProfile?.display_name} /></FeatureLockGate>} />
                  <Route path="/wallets" element={<FeatureLockGate featureKey="wallets"><Wallets /></FeatureLockGate>} />
                  <Route path="/budget" element={<FeatureLockGate featureKey="budget"><Budget /></FeatureLockGate>} />
                  <Route path="/bill-reminders" element={<FeatureLockGate featureKey="bill_reminders"><BillReminders /></FeatureLockGate>} />
                  <Route path="/installments" element={<FeatureLockGate featureKey="installments"><Installments /></FeatureLockGate>} />
                  <Route path="/savings" element={<FeatureLockGate featureKey="savings"><Savings /></FeatureLockGate>} />
                  <Route path="/gold-savings" element={<FeatureLockGate featureKey="gold_savings"><GoldSavings /></FeatureLockGate>} />
                  <Route path="/settings" element={<FeatureLockGate featureKey="settings"><Settings onUserPrefUpdated={(updatedUser) => {
                    setUserProfile({ display_name: updatedUser.display_name });
                  }} /></FeatureLockGate>} />
                  <Route path="/onboarding" element={<Onboarding />} />
                  <Route path="/admin" element={
                    adminLoading
                      ? <AdminSkeleton />
                      : isAdmin
                        ? <AdminPanel />
                        : <Navigate to="/dashboard" replace />
                  } />
                  <Route path="*" element={<Navigate to="/dashboard" replace />} />
                </Routes>
              </Suspense>
            </AnimatePresence>

            {/* Footer Copyright */}
            <footer className="mt-12 pt-6 border-t border-slate-900/10 dark:border-slate-800/50 text-center text-xs text-slate-500 transition-colors duration-300">
              <p>
                © {new Date().getFullYear()} E-Wallet Kita App. All Rights Reserved | Budi Hertanto |{" "}
                <a 
                  href="https://github.com/ocoot" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="hover:text-emerald-500 light_sakura:hover:text-rose-500 transition-colors duration-200 underline inline-flex items-center gap-1"
                >
                  Github: @ocoot
                </a>
              </p>
            </footer>
          </div>
        </div>
      </main>

      {/* Safety Sign-out Modal dialog prompt */}
      <Modal
        isOpen={isSignoutModalOpen}
        title={t("confirm.logout_title")}
        description={t("confirm.logout_desc")}
        type="warning"
        confirmLabel={t("nav.logout")}
        cancelLabel={t("common.cancel")}
        onConfirm={executeSignout}
        onCancel={() => setIsSignoutModalOpen(false)}
      />
      
      {/* Full-Screen Logout loading screen -- strukturnya sengaja disamakan
          persis dengan overlay loading di Login.tsx (kartu + judul + deskripsi
          + varian tema terang), supaya transisi logout terasa konsisten
          dengan transisi login/signup. Sebelumnya overlay ini cuma nampilin
          logo+spinner tanpa kartu terpusat, judul, deskripsi, atau varian
          light_sakura -- jadi terlihat "kosong"/beda sendiri dibanding
          loading login. */}
      <AnimatePresence>
        {isLoggingOut && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/90 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.93, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.93, opacity: 0 }}
              className="flex flex-col items-center text-center p-8
                         bg-slate-900 border border-slate-800 rounded-3xl
                         shadow-2xl max-w-xs w-full
                         light_sakura:bg-white light_sakura:border-rose-100"
            >
              <div className="relative w-14 h-14 flex items-center justify-center mb-4">
                <div className="absolute inset-0 border-[3px] border-indigo-600/20 rounded-full
                                light_sakura:border-rose-400/20" />
                <div className="absolute inset-0 border-[3px] border-t-indigo-500 rounded-full
                                animate-spin light_sakura:border-t-rose-500" />
                <img
                  src={logoUrl}
                  alt=""
                  className="w-7 h-7 object-contain animate-pulse"
                />
              </div>
              <h3 className="font-bold text-base text-white mb-1 light_sakura:text-slate-900">
                {t("common.loading")}
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed light_sakura:text-slate-500">
                {t("auth.loading_logout_desc")}
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating support chat widget (FAQ rule-based + live chat admin) -- tampil di semua halaman dashboard */}
      <SupportChatWidget />

      {/* Indikator "memeriksa pembaruan..." -- tampil sesaat setelah user
          tap notifikasi push soal update, sebelum UpdatePrompt siap tampil */}
      <UpdateCheckingIndicator />

      {/* Banner update versi baru — muncul otomatis saat build baru terdeteksi oleh SW */}
      <UpdatePrompt />

    </div>
  );
};

export default function App() {
  const { user, loading, signOut, isRecoveringPassword, setIsRecoveringPassword } = useAuth();

  return (
    <ThemeProvider>
      <LanguageProvider>
        <ToastProvider>
          <AdminProvider>
          <MaintenanceProvider>
            <CategoriesProvider>
            <BalanceVisibilityProvider>
              <Routes>
                 <Route path="/login" element={<Login />} />
                 <Route path="/auth/callback" element={<AuthCallback />} />
                 <Route path="/*" element={<MainLayout user={user} loading={loading} signOut={signOut} />} />
              </Routes>
              <ResetPasswordModal 
                isOpen={isRecoveringPassword} 
                onClose={() => setIsRecoveringPassword(false)} 
              />
            </BalanceVisibilityProvider>
            </CategoriesProvider>
          </MaintenanceProvider>
          </AdminProvider>
        </ToastProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}
