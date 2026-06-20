import React, { useState } from "react";
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { LanguageProvider } from "./contexts/LanguageContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import { ToastProvider, useToast } from "./contexts/ToastContext";
import { useAuth } from "./contexts/AuthContext";
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
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();
  
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
      showToast("Logged out successfully", "success");
    } catch (e: any) {
      showToast(e.message, "error");
    } finally {
      setIsLoggingOut(false);
    }
  };

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-slate-950 text-white transition-colors duration-300 light_sakura:bg-rose-50/20 light_sakura:text-slate-800">
      
      {/*Collapsible responsive Navigation Menu */}
      <Sidebar
        onLogoutClick={handleLogoutClick}
      />

      {/* Main active subview frame */}
      <main className="flex-1 min-h-screen p-4 sm:p-6 lg:p-8 overflow-y-auto lg:pl-72 max-w-7xl mx-auto w-full">
        <AnimatePresence mode="wait">
          <Routes>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/transactions/new" element={<NewTransaction />} />
            <Route path="/transactions" element={<History />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </AnimatePresence>
      </main>

      {/* Safety Sign-out Modal dialog prompt */}
      <Modal
        isOpen={isSignoutModalOpen}
        title="Logout"
        description="Are you sure you want to end your session?"
        type="warning"
        confirmLabel="Logout"
        cancelLabel="Cancel"
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
  return (
    <ThemeProvider>
      <LanguageProvider>
        <ToastProvider>
          <Routes>
             <Route path="/login" element={<Login />} />
             <Route path="/*" element={<MainLayout />} />
          </Routes>
        </ToastProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}
