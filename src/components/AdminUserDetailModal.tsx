import React, { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { UserProfile } from "../types";
import { useLanguage } from "../contexts/LanguageContext";
import {
  X, Shield, Ban, Crown, Mail, MessageCircle, Calendar, Hash, Wallet, TrendingUp, TrendingDown
} from "lucide-react";
import { ModalShell } from "./ModalShell";

interface UserDetail extends UserProfile {
  telegram_chat_id?: number | null;
  created_at?: string;
  premium_paid_at?: string | null;
  totalTransactions?: number;
  totalIncome?: number;
  totalExpense?: number;
}

interface Props {
  user: UserProfile | null;
  onClose: () => void;
}

export const AdminUserDetailModal: React.FC<Props> = ({ user, onClose }) => {
  const { t, locale } = useLanguage();
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    setLoading(true);

    const load = async () => {
      try {
        // Fetch full profile info
        const { data: profile } = await supabase
          .from("users")
          .select("id, email, display_name, is_premium, is_banned, role, telegram_chat_id, created_at, premium_paid_at")
          .eq("id", user.id)
          .single();

        // Fetch transaction statistics
        const { data: txStats } = await supabase
          .from("transactions")
          .select("type, amount")
          .eq("user_id", user.id);

        const totalIncome  = txStats?.filter(t => t.type === "income").reduce((sum, t) => sum + Number(t.amount), 0) ?? 0;
        const totalExpense = txStats?.filter(t => t.type === "expense").reduce((sum, t) => sum + Number(t.amount), 0) ?? 0;

        setDetail({
          ...profile,
          totalTransactions: txStats?.length ?? 0,
          totalIncome,
          totalExpense,
        } as UserDetail);
      } catch (err) {
        console.error("Error loading user details:", err);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [user]);

  if (!user) return null;

  const formatIDR = (n: number) => {
    return new Intl.NumberFormat(locale === "id" ? "id-ID" : "en-US", {
      style: "currency", currency: "IDR", maximumFractionDigits: 0
    }).format(n);
  };

  const formatDate = (iso?: string | null) => {
    if (!iso) return "—";
    return new Date(iso).toLocaleString(locale === "id" ? "id-ID" : "en-US", {
      day: "2-digit", month: "long", year: "numeric",
      hour: "2-digit", minute: "2-digit"
    });
  };

  return (
    <ModalShell
      isOpen={user !== null}
      onClose={onClose}
      ariaLabelledBy="admin-user-title"
      ariaDescribedBy="admin-user-desc"
      className="relative z-10 w-full max-w-md bg-slate-950 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden light_sakura:bg-rose-50/95 light_sakura:border-rose-100 p-0"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800/60 bg-slate-900/50 light_sakura:border-rose-100/60 light_sakura:bg-rose-100/20">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center font-black text-indigo-400 text-lg light_sakura:bg-rose-200/50 light_sakura:border-rose-300 light_sakura:text-rose-600">
            {user.display_name.charAt(0).toUpperCase()}
          </div>
          <div>
            <h2 id="admin-user-title" className="font-black text-sm text-white light_sakura:text-slate-800">{user.display_name}</h2>
            <p className="text-[clamp(0.5625rem,2.6vw,0.625rem)] text-slate-400 font-mono light_sakura:text-slate-500">{user.id.slice(0, 16)}...</p>
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label={t("common.close") || "Close"}
          className="p-2 rounded-xl hover:bg-slate-800 text-slate-400 cursor-pointer transition-colors light_sakura:hover:bg-rose-200/40 light_sakura:text-slate-500"
        >
          <X size={16} />
        </button>
      </div>

      {/* Body Content */}
      {loading ? (
        <div className="py-16 text-center text-slate-500 text-sm light_sakura:text-rose-600/70">
          {t("admin.loading_user_detail")}
        </div>
      ) : detail ? (
        <div id="admin-user-desc" className="px-6 py-5 space-y-5 max-h-[70vh] overflow-y-auto">

          {/* Status Badges */}
          <div className="flex flex-wrap gap-2">
            <span className={`px-2.5 py-1 rounded-lg text-[clamp(0.5625rem,2.6vw,0.625rem)] font-black uppercase border flex items-center gap-1
              ${detail.role === "owner" ? "bg-red-500/10 border-red-500/20 text-red-400"
                : detail.role === "admin" ? "bg-indigo-500/10 border-indigo-500/20 text-indigo-400 light_sakura:bg-rose-200/40 light_sakura:text-rose-600 light_sakura:border-rose-300"
                : "bg-slate-800 border-slate-700 text-slate-400 light_sakura:bg-slate-200 light_sakura:border-slate-300 light_sakura:text-slate-600"}`}>
              <Shield size={9} />
              {detail.role}
            </span>
            {detail.is_premium && (
              <span className="px-2.5 py-1 rounded-lg text-[clamp(0.5625rem,2.6vw,0.625rem)] font-black uppercase bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center gap-1">
                <Crown size={9} />
                Premium
              </span>
            )}
            {detail.is_banned && (
              <span className="px-2.5 py-1 rounded-lg text-[clamp(0.5625rem,2.6vw,0.625rem)] font-black uppercase bg-red-500/10 border border-red-500/20 text-red-400 flex items-center gap-1">
                <Ban size={9} />
                {t("admin.suspended_badge")}
              </span>
            )}
          </div>

          {/* General Fields */}
          <div className="space-y-3 rounded-2xl bg-slate-900/40 border border-slate-800/50 p-4 light_sakura:bg-rose-100/20 light_sakura:border-rose-100/50">
            <InfoRow icon={<Mail size={13} />}   label="Email" value={detail.email || "—"} />
            <InfoRow icon={<Hash size={13} />}   label={t("admin.user_id_label")} value={detail.id} mono />
            <InfoRow icon={<MessageCircle size={13} />} label={t("admin.telegram_chat_id_label")} value={detail.telegram_chat_id ? String(detail.telegram_chat_id) : t("admin.not_connected")} />
            <InfoRow icon={<Calendar size={13} />} label={t("admin.joined_label")} value={formatDate(detail.created_at)} />
            {detail.is_premium && (
              <InfoRow icon={<Crown size={13} />} label={t("admin.premium_joined_label")} value={formatDate(detail.premium_paid_at)} />
            )}
          </div>

          {/* Stats Summary */}
          <div>
            <p className="text-[clamp(0.5625rem,2.6vw,0.625rem)] font-black uppercase tracking-wider text-slate-400 mb-2 light_sakura:text-slate-500">
              {t("admin.transaction_stats_title")}
            </p>
            <div className="grid grid-cols-3 gap-3">
              <StatCard
                icon={<Wallet size={14} className="text-slate-400 light_sakura:text-slate-500" />}
                label={t("admin.stats_count")}
                value={String(detail.totalTransactions)}
                color="text-slate-300 light_sakura:text-slate-700"
              />
              <StatCard
                icon={<TrendingUp size={14} className="text-emerald-400" />}
                label={t("admin.stats_income")}
                value={formatIDR(detail.totalIncome ?? 0)}
                color="text-emerald-400"
              />
              <StatCard
                icon={<TrendingDown size={14} className="text-red-400" />}
                label={t("admin.stats_expense")}
                value={formatIDR(detail.totalExpense ?? 0)}
                color="text-red-400"
              />
            </div>
          </div>

          {/* Net Savings Panel */}
          <div className="rounded-2xl bg-indigo-500/5 border border-indigo-500/20 p-4 text-center light_sakura:bg-rose-200/10 light_sakura:border-rose-200">
            <p className="text-[clamp(0.5625rem,2.6vw,0.625rem)] font-black uppercase tracking-wider text-indigo-400/70 mb-1 light_sakura:text-rose-600/70">
              {t("admin.net_balance_lifetime")}
            </p>
            <p className="font-black text-xl text-indigo-400 light_sakura:text-rose-600">
              {formatIDR((detail.totalIncome ?? 0) - (detail.totalExpense ?? 0))}
            </p>
          </div>

        </div>
      ) : (
        <div className="py-16 text-center text-slate-500 text-sm">{t("toast.error_general")}</div>
      )}
    </ModalShell>
  );
};

const InfoRow: React.FC<{ icon: React.ReactNode; label: string; value: string; mono?: boolean }> = ({ icon, label, value, mono }) => (
  <div className="flex items-start justify-between gap-4">
    <div className="flex items-center gap-1.5 text-slate-500 shrink-0 text-[clamp(0.5625rem,2.6vw,0.625rem)] font-bold uppercase tracking-wider mt-0.5 light_sakura:text-slate-400">
      {icon} {label}
    </div>
    <span className={`text-xs text-slate-300 text-right break-all light_sakura:text-slate-700 ${mono ? "font-mono text-[clamp(0.5625rem,2.6vw,0.625rem)]" : ""}`}>
      {value}
    </span>
  </div>
);

const StatCard: React.FC<{ icon: React.ReactNode; label: string; value: string; color: string }> = ({ icon, label, value, color }) => (
  <div className="rounded-xl bg-slate-900 border border-slate-800 p-3 text-center light_sakura:bg-white light_sakura:border-rose-100">
    <div className="flex justify-center mb-1">{icon}</div>
    <p className={`font-black text-xs ${color} leading-tight`}>{value}</p>
    <p className="text-[clamp(0.5062rem,2.34vw,0.5625rem)] text-slate-500 mt-0.5 light_sakura:text-slate-400">{label}</p>
  </div>
);
