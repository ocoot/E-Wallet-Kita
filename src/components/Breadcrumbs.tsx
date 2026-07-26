import React from "react";
import { Link, useLocation } from "react-router-dom";
import { useLanguage } from "../contexts/LanguageContext";
import { audioFeedback } from "../lib/audio";
import { useThemeTokens } from "../hooks/useThemeTokens";
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
  CreditCard,
  Wallet,
  Landmark,
  Vault,
  Coins,
  CalendarDays
} from "lucide-react";

export const Breadcrumbs: React.FC = () => {
  const { tokens, cx } = useThemeTokens();
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
      } else if (part === "wallets") {
        list.push({
          label: t("nav.wallets"),
          path: "/wallets",
          icon: <Wallet size={14} />
        });
      } else if (part === "installments") {
        list.push({
          label: t("nav.installments"),
          path: "/installments",
          icon: <Landmark size={14} />
        });
      } else if (part === "savings") {
        list.push({
          label: t("nav.savings"),
          path: "/savings",
          icon: <Vault size={14} />
        });
      } else if (part === "gold-savings") {
        list.push({
          label: t("nav.gold_savings"),
          path: "/gold-savings",
          icon: <Coins size={14} />
        });
      } else if (part === "calendar") {
        list.push({
          label: t("nav.calendar"),
          path: "/calendar",
          icon: <CalendarDays size={14} />
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
    } else if (parts.length === 2 && parts[0] === "settings") {
      // First intermediate level: Profile/Akun
      list.push({
        label: t("nav.settings"),
        path: "/settings",
        icon: <Settings size={14} />
      });
      // Second level: menu detail yang sedang dibuka
      const settingsSubLabels: Record<string, string> = {
        profile: t("settings.menu_manage_profile"),
        security: t("settings.menu_security"),
        notifications: t("settings.menu_notifications"),
        language: t("settings.menu_language"),
        theme: t("settings.menu_theme"),
        pwa: t("settings.menu_pwa"),
        telegram: t("settings.menu_telegram"),
        privacy: t("settings.menu_privacy"),
      };
      const subLabel = settingsSubLabels[parts[1]];
      if (subLabel) {
        list.push({
          label: subLabel,
          path: pathname,
          icon: <Settings size={14} />
        });
      }
    } else if (parts.length === 2 && parts[0] === "admin") {
      // First intermediate level: Admin Panel
      list.push({
        label: t("nav.admin_panel"),
        path: "/admin",
        icon: <Shield size={14} />
      });
      // Second level: menu detail yang sedang dibuka (mis. Manajemen User,
      // Monitor Premium, dst -- lihat AdminPanel.tsx untuk daftar menunya)
      const adminSubLabels: Record<string, string> = {
        users: t("admin.tab_users"),
        premium: t("admin.tab_premium"),
        voucher: t("admin.tab_voucher"),
        categories: t("admin.tab_categories"),
        broadcast: t("admin.tab_broadcast"),
        "support-chat": t("admin.tab_support_chat"),
        "ai-monitor": t("admin.tab_ai_monitor"),
        "error-monitor": t("admin.tab_error_monitor"),
        maintenance: t("admin.tab_maintenance"),
        backup: t("admin.tab_backup"),
      };
      const adminSubLabel = adminSubLabels[parts[1]];
      if (adminSubLabel) {
        list.push({
          label: adminSubLabel,
          path: pathname,
          icon: <Shield size={14} />
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
    <div className="overflow-hidden rounded-3xl max-w-fit">
    <nav 
      id="app-breadcrumbs-nav" 
      aria-label="breadcrumb"
      className={cx(
        "flex items-center overflow-x-auto whitespace-nowrap pt-3 pb-8 -mb-5 px-5 rounded-3xl border shadow-sm text-xs transition-all duration-300 max-w-fit scrollbar-hide",
        tokens.surface.card,
        tokens.border.accent,
        tokens.text.muted
      )}
    >
      <ol className="flex items-center gap-1.5 sm:gap-2">
        {breadcrumbs.map((item, index) => {
          const isLast = index === breadcrumbs.length - 1;

          return (
            <React.Fragment key={item.path + index}>
              {index > 0 && (
                <ChevronRight 
                  size={12} 
                  className={cx("shrink-0", tokens.text.faint)} 
                />
              )}
              <li className="flex items-center">
                {isLast ? (
                  <span 
                    className={cx("flex items-center gap-1.5 font-bold cursor-default select-none", tokens.text.accent)}
                    aria-current="page"
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </span>
                ) : (
                  <Link
                    to={item.path}
                    onClick={() => audioFeedback.playClick()}
                    className={cx("flex items-center gap-1.5 font-medium transition-colors duration-200", tokens.text.muted, tokens.breadcrumbs.linkHover)}
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
    </div>
  );
};
