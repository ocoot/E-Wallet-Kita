import React, { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { UserProfile } from "../types";
import { useLanguage } from "../contexts/LanguageContext";
import { useLockBodyScroll } from "../hooks/useLockBodyScroll";
import { useDialogA11y } from "../hooks/useDialogA11y";
import { useThemeTokens } from "../hooks/useThemeTokens";
import {
  X, Shield, Ban, Crown, Mail, MessageCircle, Calendar, Hash, Wallet, TrendingUp, TrendingDown
} from "lucide-react";

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
  const { tokens, cx } = useThemeTokens();
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);

  useLockBodyScroll(!!user);
  const panelRef = React.useRef<HTMLDivElement>(null);
  useDialogA11y(!!user, panelRef, onClose);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    setLoadError(false);
    setDetail(null);

    const load = async () => {
      try {
        // Fetch full profile info
        const { data: profile, error: profileError } = await supabase
          .from("users")
          .select("id, email, display_name, is_premium, is_banned, role, telegram_chat_id, created_at, premium_paid_at")
          .eq("id", user.id)
          .single();

        if (profileError) throw profileError;

        // Fetch transaction statistics
        const { data: txStats, error: txError } = await supabase
          .from("transactions")
          .select("type, amount")
          .eq("user_id", user.id);

        if (txError) throw txError;

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
        setLoadError(true);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal Card */}
      <div ref={panelRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className={cx("relative z-10 w-full max-w-md my-auto max-h-[85vh] flex flex-col border rounded-3xl shadow-2xl overflow-hidden outline-none", tokens.surface.card, tokens.border.accent)}>

        {/* Header */}
        <div className={cx("shrink-0 flex items-center justify-between px-6 py-4 border-b", tokens.border.accent, tokens.surface.sunken)}>
          <div className="flex items-center gap-3">
            <div className={cx("w-10 h-10 rounded-2xl border flex items-center justify-center font-black text-lg bg-indigo-500/10 border-indigo-500/20 light_sakura:bg-rose-200/50 light_sakura:border-rose-300", tokens.text.accent)}>
              {user.display_name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h2 className={cx("font-black text-sm", tokens.text.onSurface)}>{user.display_name}</h2>
              <p className={cx("text-[clamp(0.5625rem,2.6vw,0.625rem)] font-mono", tokens.text.muted)}>{user.id.slice(0, 16)}...</p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Tutup"
            className={cx("p-2 rounded-xl cursor-pointer transition-colors", tokens.hover.surface, tokens.text.muted)}
          >
            <X size={16} />
          </button>
        </div>

        {/* Body Content */}
        {loading ? (
          <div className={cx("py-16 text-center text-sm", tokens.text.muted)}>
            {t("admin.loading_user_detail")}
          </div>
        ) : loadError ? (
          <div className="py-16 text-center text-red-400 text-sm px-6">
            {t("toast.error_general")}
          </div>
        ) : detail ? (
          <div className="px-6 py-5 space-y-5 flex-1 overflow-y-auto">

            {/* Status Badges */}
            <div className="flex flex-wrap gap-2">
              <span className={cx(
                "px-2.5 py-1 rounded-lg text-[clamp(0.5625rem,2.6vw,0.625rem)] font-black uppercase border flex items-center gap-1",
                detail.role === "owner" && "bg-red-500/10 border-red-500/20 text-red-400",
                detail.role === "admin" && "bg-indigo-500/10 border-indigo-500/20 text-indigo-400 light_sakura:bg-rose-200/40 light_sakura:border-rose-300 light_sakura:text-rose-600",
                detail.role === "user" && "bg-slate-800 border-slate-700 text-slate-400 light_sakura:bg-slate-200 light_sakura:border-slate-300 light_sakura:text-slate-600"
              )}>
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
            <div className={cx("space-y-3 rounded-2xl border p-4", tokens.surface.sunken, tokens.border.accent)}>
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
              <p className={cx("text-[clamp(0.5625rem,2.6vw,0.625rem)] font-black uppercase tracking-wider mb-2", tokens.text.muted)}>
                {t("admin.transaction_stats_title")}
              </p>
              <div className="grid grid-cols-3 gap-3">
                <StatCard
                  icon={<Wallet size={14} className={cx(tokens.text.muted)} />}
                  label={t("admin.stats_count")}
                  value={String(detail.totalTransactions)}
                  color={tokens.text.secondary}
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
            <div className={cx("rounded-2xl border p-4 text-center", tokens.surface.sunken, tokens.border.accent)}>
              <p className={cx("text-[clamp(0.5625rem,2.6vw,0.625rem)] font-black uppercase tracking-wider mb-1", tokens.text.muted)}>
                {t("admin.net_balance_lifetime")}
              </p>
              <p className={cx("font-black text-xl", tokens.text.accent)}>
                {formatIDR((detail.totalIncome ?? 0) - (detail.totalExpense ?? 0))}
              </p>
            </div>

          </div>
        ) : (
          <div className="py-16 text-center text-slate-500 text-sm">{t("toast.error_general")}</div>
        )}

      </div>
    </div>
  );
};

const InfoRow: React.FC<{ icon: React.ReactNode; label: string; value: string; mono?: boolean }> = ({ icon, label, value, mono }) => {
  const { tokens, cx } = useThemeTokens();
  return (
  <div className="flex items-start justify-between gap-4">
    <div className={cx("flex items-center gap-1.5 shrink-0 text-[clamp(0.5625rem,2.6vw,0.625rem)] font-bold uppercase tracking-wider mt-0.5", tokens.text.faint)}>
      {icon} {label}
    </div>
    <span className={cx("text-xs text-right break-all", tokens.text.secondary, mono && "font-mono text-[clamp(0.5625rem,2.6vw,0.625rem)]")}>
      {value}
    </span>
  </div>
  );
};

const StatCard: React.FC<{ icon: React.ReactNode; label: string; value: string; color: string }> = ({ icon, label, value, color }) => {
  const { tokens, cx } = useThemeTokens();
  return (
  <div className={cx("rounded-xl border p-3 text-center", tokens.surface.card, tokens.border.accent)}>
    <div className="flex justify-center mb-1">{icon}</div>
    <p className={`font-black text-xs ${color} leading-tight`}>{value}</p>
    <p className={cx("text-[clamp(0.5062rem,2.34vw,0.5625rem)] mt-0.5", tokens.text.faint)}>{label}</p>
  </div>
  );
};
