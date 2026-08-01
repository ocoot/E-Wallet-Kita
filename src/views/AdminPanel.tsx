import React from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { useLanguage } from "../contexts/LanguageContext";
import { useAdmin } from "../hooks/useAdmin";
import { audioFeedback } from "../lib/audio";
import {
  User,
  ShieldX,
  ChevronRight,
  Sparkles,
  Ticket,
  Tags,
  Megaphone,
  MessageCircle,
  Bot,
  AlertTriangle,
  Wrench,
  HardDrive
} from "lucide-react";
import { useThemeTokens } from "../hooks/useThemeTokens";

type AdminTab = "users" | "premium" | "voucher" | "categories" | "broadcast" | "ai_monitor" | "error_monitor" | "maintenance" | "support_chat" | "backup";

// Peta key tab -> segmen path route halaman detailnya (lihat App.tsx).
// Sebagian besar sama persis dengan key tab, kecuali beberapa yang pakai
// underscore diubah ke kebab-case supaya URL lebih rapi.
const TAB_ROUTES: Record<AdminTab, string> = {
  users: "users",
  premium: "premium",
  voucher: "voucher",
  categories: "categories",
  broadcast: "broadcast",
  ai_monitor: "ai-monitor",
  error_monitor: "error-monitor",
  maintenance: "maintenance",
  support_chat: "support-chat",
  backup: "backup",
};

/**
 * Admin Panel -- sekarang murni menjadi halaman "hub" berisi daftar menu.
 * Sebelumnya, memilih salah satu menu di sini langsung merender konten
 * menu tsb di halaman yang sama (di bawah daftar menu), sehingga makin
 * banyak menu yang pernah dibuka makin panjang scroll-nya. Sekarang tiap
 * menu membuka halaman/route barunya sendiri (mis. /admin/users,
 * /admin/premium, dst -- lihat App.tsx), dan tiap halaman detail tsb
 * punya tombol "Kembali ke Admin Panel" (lihat AdminBackBar.tsx) untuk
 * kembali ke daftar menu ini.
 */
export const AdminPanel: React.FC = () => {
  const { t } = useLanguage();
  const { isAdmin } = useAdmin();
  const { tokens, cx } = useThemeTokens();
  const navigate = useNavigate();

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6 bg-slate-950/20 rounded-2xl border border-red-500/10">
        <ShieldX size={48} className="text-red-500 mb-4 animate-bounce" />
        <h2 className="font-sans font-bold text-lg text-slate-100">
          {t("admin.access_denied")}
        </h2>
        <p className="font-sans text-xs text-slate-400 mt-2 max-w-md leading-relaxed">
          {t("admin.access_denied_desc")}
        </p>
      </div>
    );
  }

  const handleSelectTab = (tab: AdminTab) => {
    audioFeedback.playClick();
    navigate(`/admin/${TAB_ROUTES[tab]}`);
  };

  const GROUP_ACCENTS = [
    { iconBg: "bg-emerald-500/10", iconText: "text-emerald-400" },
    { iconBg: "bg-indigo-500/10", iconText: "text-indigo-400" },
    { iconBg: "bg-amber-500/10", iconText: "text-amber-400" },
  ];

  const groups = [
    {
      captionKey: "admin.tab_group_data",
      tabs: [
        { key: "users" as AdminTab,   icon: <User size={16} />,     label: t("admin.tab_users"),   desc: t("admin.tab_users_desc") },
        { key: "premium" as AdminTab, icon: <Sparkles size={16} />, label: t("admin.tab_premium"), desc: t("admin.tab_premium_desc") },
        { key: "voucher" as AdminTab, icon: <Ticket size={16} />,   label: t("admin.tab_voucher"), desc: t("admin.tab_voucher_desc") },
      ],
    },
    {
      captionKey: "admin.tab_group_content",
      tabs: [
        { key: "categories" as AdminTab,   icon: <Tags size={16} />,          label: t("admin.tab_categories"),   desc: t("admin.tab_categories_desc") },
        { key: "broadcast" as AdminTab,    icon: <Megaphone size={16} />,     label: t("admin.tab_broadcast"),    desc: t("admin.tab_broadcast_desc") },
        { key: "support_chat" as AdminTab, icon: <MessageCircle size={16} />, label: t("admin.tab_support_chat"), desc: t("admin.tab_support_chat_desc") },
      ],
    },
    {
      captionKey: "admin.tab_group_system",
      tabs: [
        { key: "ai_monitor" as AdminTab,    icon: <Bot size={16} />,           label: t("admin.tab_ai_monitor"),    desc: t("admin.tab_ai_monitor_desc") },
        { key: "error_monitor" as AdminTab, icon: <AlertTriangle size={16} />, label: t("admin.tab_error_monitor"), desc: t("admin.tab_error_monitor_desc") },
        { key: "maintenance" as AdminTab,   icon: <Wrench size={16} />,        label: t("admin.tab_maintenance"),   desc: t("admin.tab_maintenance_desc") },
        { key: "backup" as AdminTab,        icon: <HardDrive size={16} />,     label: t("admin.tab_backup"),        desc: t("admin.tab_backup_desc") },
      ],
    },
  ];

  return (
    <div className="space-y-5">

      <div className="space-y-6">

          {/* Page title */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
            className={cx("overflow-hidden rounded-2xl border shadow-sm", tokens.surface.card, tokens.border.accent)}
          >
            <div className="h-1 w-full bg-gradient-to-r from-emerald-600/80 via-indigo-500/60 to-emerald-400/80" />
            <div className="px-5 py-4">
              <h1 className={cx("font-sans font-bold text-2xl tracking-tight", tokens.text.heading)}>
                {t("nav.admin_panel")}
              </h1>
              <p className={cx("font-sans text-sm mt-1 font-medium", tokens.text.muted)}>
                {t("admin.panel_desc")}
              </p>
            </div>
          </motion.div>

          <nav className="space-y-6">
            {groups.map((group, groupIndex) => (
              <motion.div
                key={group.captionKey}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: (groupIndex + 1) * 0.08 }}
                className="space-y-2"
              >
                <span className="px-1 font-sans text-[clamp(0.5625rem,2.6vw,0.625rem)] font-semibold tracking-wide text-slate-500">
                  {t(group.captionKey)}
                </span>
                <div className={cx("rounded-2xl border divide-y overflow-hidden", tokens.surface.card, tokens.border.subtleRose, tokens.divide.subtleRose)}>
                  {group.tabs.map(tab => (
                    <button
                      key={tab.key}
                      onClick={() => handleSelectTab(tab.key)}
                      className={cx(
                        "w-full flex items-center gap-3 px-4 py-3.5 text-left transition-all duration-200 cursor-pointer active:scale-[0.98]",
                        tokens.hover.sunken
                      )}
                    >
                      <span className={cx(
                        "shrink-0 w-9 h-9 rounded-xl flex items-center justify-center",
                        GROUP_ACCENTS[groupIndex].iconBg,
                        GROUP_ACCENTS[groupIndex].iconText
                      )}>
                        {tab.icon}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={cx("block font-sans text-sm font-semibold truncate", tokens.text.label)}>
                          {tab.label}
                        </span>
                        {tab.desc && (
                          <span className="block font-sans text-[clamp(0.6188rem,2.86vw,0.6875rem)] text-slate-500 truncate mt-0.5">
                            {tab.desc}
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 flex items-center">
                        <ChevronRight size={16} className={tokens.icon.subtle} />
                      </span>
                    </button>
                  ))}
                </div>
              </motion.div>
            ))}
          </nav>

      </div>

    </div>
  );
};
