import React, { useState, useEffect, useRef } from "react";
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { LanguageProvider, useLanguage } from "./contexts/LanguageContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import { ToastProvider, useToast } from "./contexts/ToastContext";
import { MaintenanceProvider } from "./contexts/MaintenanceContext";
import { useAuth } from "./contexts/AuthContext";
import { Sidebar } from "./components/Sidebar";
import { Login } from "./views/Login";
import { AuthCallback } from "./components/AuthCallback";
import { Dashboard } from "./views/Dashboard";
import { NewTransaction } from "./views/NewTransaction";
import { History } from "./views/History";
import { Settings } from "./views/Settings";
import { Budget } from "./views/Budget";
import { BillReminders } from "./views/BillReminders";
import { AdminPanel } from "./views/AdminPanel";
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

const MainLayout: React.FC = () => {
  const { user, loading, signOut } = useAuth();
  const { isAdmin } = useAdmin();
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
      supabase.removeChannel(transactionChannel);
      supabase.removeChannel(voucherChannel);
    };
  }, [user, t, showToast]);
  
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
                <Route path="/admin" element={isAdmin ? <AdminPanel /> : <Navigate to="/dashboard" replace />} />
                <Route path="*" element={<Navigate to="/dashboard" replace />} />
              </Routes>
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
  const { isRecoveringPassword, setIsRecoveringPassword } = useAuth();

  return (
    <ThemeProvider>
      <LanguageProvider>
        <ToastProvider>
          <MaintenanceProvider>
            <Routes>
               <Route path="/login" element={<Login />} />
               <Route path="/auth/callback" element={<AuthCallback />} />
               <Route path="/*" element={<MainLayout />} />
            </Routes>
            <ResetPasswordModal 
              isOpen={isRecoveringPassword} 
              onClose={() => setIsRecoveringPassword(false)} 
            />
          </MaintenanceProvider>
        </ToastProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}
