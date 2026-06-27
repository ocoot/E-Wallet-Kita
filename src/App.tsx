import React, { useState, useEffect, useRef, Suspense, lazy } from "react";
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { LanguageProvider, useLanguage } from "./contexts/LanguageContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import { ToastProvider, useToast } from "./contexts/ToastContext";
import { MaintenanceProvider } from "./contexts/MaintenanceContext";
import { CategoriesProvider } from "./contexts/CategoriesContext";
import { AdminProvider } from "./contexts/AdminContext";
import { useAuth } from "./contexts/AuthContext";
import { usePremium } from "./hooks/usePremium";
import { Sidebar } from "./components/Sidebar";
import { Login } from "./views/Login";
import { AuthCallback } from "./components/AuthCallback";
import { Onboarding } from "./views/Onboarding";
import { useAdmin } from "./hooks/useAdmin";
import { Modal } from "./components/Modal";
import { ResetPasswordModal } from "./components/ResetPasswordModal";
import { MaintenanceBanner } from "./components/MaintenanceBanner";
import { FeatureLockGate } from "./components/FeatureLockGate";
import { SupportChatWidget } from "./components/SupportChatWidget";
import { Breadcrumbs } from "./components/Breadcrumbs";
import { motion, AnimatePresence } from "motion/react";
import { LogOut } from "lucide-react";
import { supabase } from "./lib/supabase";
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
const BillReminders = lazy(() => import("./views/BillReminders").then(m => ({ default: m.BillReminders })));
const AdminPanel = lazy(() => import("./views/AdminPanel").then(m => ({ default: m.AdminPanel })));

const RouteFallback = () => (
  <div className="flex items-center justify-center py-24 text-slate-400 light_sakura:text-slate-500">
    Loading...
  </div>
);

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
    <div className="min-h-screen flex flex-col lg:flex-row bg-slate-950 text-white transition-colors duration-300 light_sakura:bg-rose-50/20 light_sakura:text-slate-800">
      
      {/*Collapsible responsive Navigation Menu */}
      <Sidebar
        onLogoutClick={handleLogoutClick}
        isCollapsed={isSidebarCollapsed}
        onToggle={setIsSidebarCollapsed}
        userDisplayName={userProfile?.display_name}
      />

      {/* Main active subview frame */}
      <main className={`flex-1 min-h-screen overflow-y-auto w-full transition-all duration-300 ${isSidebarCollapsed ? 'lg:pl-20' : 'lg:pl-64'}`}>
        {/* Running text maintenance banner, shown globally above all pages */}
        <MaintenanceBanner />

        <div className="p-4 sm:p-6 lg:p-8">
          <div className="max-w-7xl mx-auto w-full">
            <Breadcrumbs />
            <AnimatePresence mode="wait">
              <Suspense fallback={<RouteFallback />}>
                <Routes>
                  <Route path="/dashboard" element={<Dashboard transactionsUpdatedTrigger={transactionsUpdatedTrigger} onTransactionAdded={handleTransactionChange} userDisplayName={userProfile?.display_name} />} />
                  <Route path="/transactions/new" element={<FeatureLockGate featureKey="new_transaction"><NewTransaction onTransactionAdded={handleTransactionChange} userDisplayName={userProfile?.display_name} /></FeatureLockGate>} />
                  <Route path="/transactions" element={<FeatureLockGate featureKey="history"><History transactionsUpdatedTrigger={transactionsUpdatedTrigger} onTransactionUpdated={handleTransactionChange} userDisplayName={userProfile?.display_name} /></FeatureLockGate>} />
                  <Route path="/budget" element={<FeatureLockGate featureKey="budget"><Budget /></FeatureLockGate>} />
                  <Route path="/bill-reminders" element={<FeatureLockGate featureKey="bill_reminders"><BillReminders /></FeatureLockGate>} />
                  <Route path="/settings" element={<FeatureLockGate featureKey="settings"><Settings onUserPrefUpdated={(updatedUser) => {
                    setUserProfile({ display_name: updatedUser.display_name });
                  }} /></FeatureLockGate>} />
                  <Route path="/onboarding" element={<Onboarding />} />
                  <Route path="/admin" element={
                    adminLoading
                      ? <RouteFallback />
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
      
      {/* Full-Screen Logout loading screen */}
      <AnimatePresence>
        {isLoggingOut && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-slate-950/90 backdrop-blur-md"
          >
            <div className="p-8 bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl">
                 <LogOut className="animate-spin text-red-500" size={48} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating support chat widget (FAQ rule-based + live chat admin) -- tampil di semua halaman dashboard */}
      <SupportChatWidget />

    </div>
  );
};

export default function App() {
  const { user, loading, signOut, isRecoveringPassword, setIsRecoveringPassword } = useAuth();

  return (
    <ThemeProvider>
      <LanguageProvider>
        <ToastProvider>
          <MaintenanceProvider>
            <CategoriesProvider>
            <AdminProvider>
              <Routes>
                 <Route path="/login" element={<Login />} />
                 <Route path="/auth/callback" element={<AuthCallback />} />
                 <Route path="/*" element={<MainLayout user={user} loading={loading} signOut={signOut} />} />
              </Routes>
              <ResetPasswordModal 
                isOpen={isRecoveringPassword} 
                onClose={() => setIsRecoveringPassword(false)} 
              />
            </AdminProvider>
            </CategoriesProvider>
          </MaintenanceProvider>
        </ToastProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}
