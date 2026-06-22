import React, { useState, useEffect } from "react";
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { LanguageProvider, useLanguage } from "./contexts/LanguageContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import { ToastProvider, useToast } from "./contexts/ToastContext";
import { useAuth } from "./contexts/AuthContext";
import { Sidebar } from "./components/Sidebar";
import { Login } from "./views/Login";
import { AuthCallback } from "./components/AuthCallback";
import { Dashboard } from "./views/Dashboard";
import { NewTransaction } from "./views/NewTransaction";
import { History } from "./views/History";
import { Settings } from "./views/Settings";
import { Modal } from "./components/Modal";
import { ResetPasswordModal } from "./components/ResetPasswordModal";
import { motion, AnimatePresence } from "motion/react";
import { LogOut } from "lucide-react";
import { supabase } from "./lib/supabase";

const MainLayout: React.FC = () => {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { t } = useLanguage();
  
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [transactionsUpdatedTrigger, setTransactionsUpdatedTrigger] = useState(0);

  const handleTransactionChange = () => {
    setTransactionsUpdatedTrigger(prev => prev + 1);
  };

  // Real-time listen to user's database change events on the transactions table
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`realtime-transactions-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "transactions",
          filter: `user_id=eq.${user.id}`
        },
        () => {
          setTransactionsUpdatedTrigger(prev => prev + 1);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);
  
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
      />

      {/* Main active subview frame */}
      <main className={`flex-1 min-h-screen p-4 sm:p-6 lg:p-8 overflow-y-auto w-full transition-all duration-300 ${isSidebarCollapsed ? 'lg:pl-20' : 'lg:pl-64'}`}>
        <div className="max-w-7xl mx-auto w-full">
          <AnimatePresence mode="wait">
            <Routes>
              <Route path="/dashboard" element={<Dashboard transactionsUpdatedTrigger={transactionsUpdatedTrigger} onTransactionAdded={handleTransactionChange} />} />
              <Route path="/transactions/new" element={<NewTransaction onTransactionAdded={handleTransactionChange} />} />
              <Route path="/transactions" element={<History transactionsUpdatedTrigger={transactionsUpdatedTrigger} onTransactionUpdated={handleTransactionChange} />} />
              <Route path="/settings" element={<Settings onUserPrefUpdated={(user) => {}} />} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </AnimatePresence>
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

    </div>
  );
};

export default function App() {
  const { isRecoveringPassword, setIsRecoveringPassword } = useAuth();

  return (
    <ThemeProvider>
      <LanguageProvider>
        <ToastProvider>
          <Routes>
             <Route path="/login" element={<Login />} />
             <Route path="/auth/callback" element={<AuthCallback />} />
             <Route path="/*" element={<MainLayout />} />
          </Routes>
          <ResetPasswordModal 
            isOpen={isRecoveringPassword} 
            onClose={() => setIsRecoveringPassword(false)} 
          />
        </ToastProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}
