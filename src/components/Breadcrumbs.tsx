import React from "react";
import { Link, useLocation } from "react-router-dom";
import { useLanguage } from "../contexts/LanguageContext";
import { audioFeedback } from "../lib/audio";
import { 
  ChevronRight, 
  Home, 
  LayoutDashboard, 
  History, 
  PlusCircle, 
  Settings, 
  BookOpen, 
  Shield,
  PiggyBank,
  ReceiptText,
  CreditCard
} from "lucide-react";

export const Breadcrumbs: React.FC = () => {
  const { t, locale } = useLanguage();
  const location = useLocation();
  const pathname = location.pathname;

  // Generate breadcrumb path mappings dynamically
  const getBreadcrumbs = () => {
    const parts = pathname.split("/").filter(Boolean);
    const list: { label: string; path: string; icon: React.ReactNode }[] = [];

    // Always include home / E-Wallet Kita
    list.push({
      label: t("app.title"),
      path: "/dashboard",
      icon: <Home size={14} className="transition-colors" />
    });

    if (parts.length === 1) {
      const part = parts[0];
      if (part === "dashboard") {
        list.push({
          label: t("nav.dashboard"),
          path: "/dashboard",
          icon: <LayoutDashboard size={14} />
        });
      } else if (part === "transactions") {
        list.push({
          label: t("nav.history"),
          path: "/transactions",
          icon: <History size={14} />
        });
      } else if (part === "settings") {
        list.push({
          label: t("nav.settings"),
          path: "/settings",
          icon: <Settings size={14} />
        });
      } else if (part === "budget") {
        list.push({
          label: t("nav.budget"),
          path: "/budget",
          icon: <PiggyBank size={14} />
        });
      } else if (part === "bill-reminders") {
        list.push({
          label: t("nav.bill_reminders"),
          path: "/bill-reminders",
          icon: <ReceiptText size={14} />
        });
      } else if (part === "onboarding") {
        list.push({
          label: t("nav.onboarding"),
          path: "/onboarding",
          icon: <BookOpen size={14} />
        });
      } else if (part === "admin") {
        list.push({
          label: t("nav.admin_panel"),
          path: "/admin",
          icon: <Shield size={14} />
        });
      }
    } else if (parts.length === 2 && parts[0] === "transactions") {
      // First intermediate level: Transactions History
      list.push({
        label: t("nav.history"),
        path: "/transactions",
        icon: <History size={14} />
      });
      // Second level: New Transaction / Manual Entry
      if (parts[1] === "new") {
        list.push({
          label: t("nav.new_transaction"),
          path: "/transactions/new",
          icon: <PlusCircle size={14} />
        });
      }
    }

    return list;
  };

  const breadcrumbs = getBreadcrumbs();

  if (breadcrumbs.length <= 1 && pathname === "/dashboard") {
    // Optionally only show Home breadcrumb on dashboard, or hide if it's redundant.
    // Let's show it anyway for structural location identification, as it's nice, but styled cleanly.
  }

  return (
    <nav 
      id="app-breadcrumbs-nav" 
      aria-label="breadcrumb"
      className="mb-6 flex items-center overflow-x-auto whitespace-nowrap py-3 px-5 rounded-3xl bg-slate-900 border border-slate-900 light_sakura:bg-white light_sakura:border-rose-100/10 shadow-sm text-xs text-slate-400 transition-all duration-300 max-w-fit"
    >
      <ol className="flex items-center gap-1.5 sm:gap-2">
        {breadcrumbs.map((item, index) => {
          const isLast = index === breadcrumbs.length - 1;

          return (
            <React.Fragment key={item.path + index}>
              {index > 0 && (
                <ChevronRight 
                  size={12} 
                  className="text-slate-600 shrink-0 light_sakura:text-rose-300" 
                />
              )}
              <li className="flex items-center">
                {isLast ? (
                  <span 
                    className="flex items-center gap-1.5 font-bold text-emerald-400 light_sakura:text-rose-500 cursor-default select-none"
                    aria-current="page"
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </span>
                ) : (
                  <Link
                    to={item.path}
                    onClick={() => audioFeedback.playClick()}
                    className="flex items-center gap-1.5 font-medium text-slate-400 hover:text-slate-200 transition-colors duration-200 light_sakura:text-slate-500 light_sakura:hover:text-slate-800"
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </Link>
                )}
              </li>
            </React.Fragment>
          );
        })}
      </ol>
    </nav>
  );
};
