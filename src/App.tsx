import React, { useState, useEffect } from "react";
import { LanguageProvider, useLanguage } from "./contexts/LanguageContext";
import { ThemeProvider, useTheme } from "./contexts/ThemeContext";
import { ToastProvider, useToast } from "./contexts/ToastContext";
import { authService, UserSession } from "./lib/auth";
import { Sidebar } from "./components/Sidebar";
import { Login } from "./views/Login";
import { Dashboard } from "./views/Dashboard";
import { NewTransaction } from "./views/NewTransaction";
import { History } from "./views/History";
import { Settings } from "./views/Settings";
import { Modal } from "./components/Modal";
import { motion, AnimatePresence } from "motion/react";
import { LogOut } from "lucide-react";

const MainLayout: React.FC = () => {
  const { t } = useLanguage();
  const { theme } = useTheme();
  const { showToast } = useToast();

  const [currentUser, setCurrentUser] = useState<UserSession | null>(() => authService.getCurrentUser());
  const [activeTab, setActiveTab] = useState<string>("dashboard");

  // Re-evaluation lock tracking to sync dashboard + ledger logs instantly
  const [transactionsUpdatedTrigger, setTransactionsUpdatedTrigger] = useState<number>(0);

  // Signout prompt control triggers
  const [isSignoutModalOpen, setIsSignoutModalOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleTransactionAdded = () => {
    setTransactionsUpdatedTrigger((prev) => prev + 1);
  };

  const handleLoginSuccess = (user: UserSession) => {
    setCurrentUser(user);
    setActiveTab("dashboard");
  };

  const handleLogoutClick = () => {
    setIsSignoutModalOpen(true);
  };

  const executeSignout = () => {
    setIsSignoutModalOpen(false);
    setIsLoggingOut(true);
    
    // Smooth high fidelity artificial block delay for logout process feel
    setTimeout(() => {
      authService.signOut();
      setCurrentUser(null);
      setIsLoggingOut(false);
      showToast(t("toast.logout_done"), "success");
    }, 1200);
  };

  // Sync display-name and settings updates locally
  const handleUserPrefUpdated = (updatedUser: UserSession) => {
    setCurrentUser(updatedUser);
  };

  if (!currentUser) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-slate-950 text-white transition-colors duration-300 light_sakura:bg-rose-50/20 light_sakura:text-slate-800">
      
      {/*Collapsible responsive Navigation Menu */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        currentUser={currentUser}
        onLogoutClick={handleLogoutClick}
      />

      {/* Main active subview frame */}
      <main className="flex-1 min-h-screen p-4 sm:p-6 lg:p-8 overflow-y-auto lg:pl-72 lg:pl-72-override max-w-7xl mx-auto w-full">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.18 }}
            className="w-full h-full pb-12"
          >
            {activeTab === "dashboard" && (
              <Dashboard
                currentUser={currentUser}
                transactionsUpdatedTrigger={transactionsUpdatedTrigger}
                onTransactionAdded={handleTransactionAdded}
              />
            )}

            {activeTab === "new_transaction" && (
              <NewTransaction
                currentUser={currentUser}
                onTransactionAdded={handleTransactionAdded}
                setActiveTab={setActiveTab}
              />
            )}

            {activeTab === "history" && (
              <History
                currentUser={currentUser}
                transactionsUpdatedTrigger={transactionsUpdatedTrigger}
                onTransactionUpdated={handleTransactionAdded}
              />
            )}

            {activeTab === "settings" && (
              <Settings
                currentUser={currentUser}
                onUserPrefUpdated={handleUserPrefUpdated}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Safety Sign-out Modal dialog prompt */}
      <Modal
        isOpen={isSignoutModalOpen}
        title={t("nav.logout")}
        description="Apakah Anda yakin ingin mengakhiri sesi pencatatan keuangan Anda saat ini? Semua progres cache lokal Anda akan tetap aman."
        type="warning"
        confirmLabel="Keluar Sesi"
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
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="flex flex-col items-center text-center p-8 bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl max-w-xs w-full light_sakura:bg-white light_sakura:border-rose-100"
            >
              <div className="relative flex items-center justify-center w-16 h-16 mb-4">
                <div className="absolute inset-0 border-4 border-red-500/20 rounded-full" />
                <div className="absolute inset-0 border-4 border-t-red-500 rounded-full animate-spin" />
                <LogOut className="text-red-400" size={24} />
              </div>
              <h3 className="font-sans font-bold text-lg text-white mb-1.5 light_sakura:text-slate-900">
                Mengakhiri Sesi...
              </h3>
              <p className="font-sans text-xs text-slate-400 light_sakura:text-slate-600 leading-relaxed">
                Mengunci dan mengamankan catatan dompet Anda secara lokal...
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
};

export default function App() {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <ToastProvider>
          <MainLayout />
        </ToastProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}
