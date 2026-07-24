import React, { useState, useEffect, useCallback } from "react";
import { useLanguage } from "../contexts/LanguageContext";
import { useToast } from "../contexts/ToastContext";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../lib/supabase";
import { useAdmin } from "../hooks/useAdmin";
import { UserProfile } from "../types";
import { audioFeedback } from "../lib/audio";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { DropdownField } from "../components/DropdownField";
import { AdminBackBar } from "../components/AdminBackBar";
import { reportFrontendError } from "../lib/errorReporter";
import {
  User,
  Mail,
  Search,
  CheckCircle,
  XCircle,
  Clock,
  UserCheck,
  UserX,
  Shield,
} from "lucide-react";
import { Modal } from "../components/Modal";
import { ScrollableTableWrapper } from "../components/ScrollableTableWrapper";
import { useThemeTokens } from "../hooks/useThemeTokens";
import { LoadingOverlay } from "../components/LoadingOverlay";
import { AdminUserDetailModal } from "../components/AdminUserDetailModal";
import { Input } from "../components/ui/Input";
import { Badge } from "../components/ui/Badge";

/**
 * Halaman "Manajemen User" -- sebelumnya adalah tab "users" yang dirender
 * inline di dalam AdminPanel.tsx (di bawah daftar menu, di halaman yang
 * sama). Sekarang jadi halaman/route tersendiri (/admin/users) supaya
 * pengguna tidak perlu scroll melewati daftar menu Admin Panel dulu untuk
 * sampai ke kontennya. Lihat AdminPanel.tsx untuk daftar menu (hub) dan
 * App.tsx untuk definisi route-nya.
 */
export const AdminUserManager: React.FC = () => {
  const { t, locale } = useLanguage();
  const { showToast } = useToast();
  const { user: currentUser } = useAuth();
  const { isAdmin, isOwner } = useAdmin();
  const { tokens, cx } = useThemeTokens();

  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [usersError, setUsersError] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [premiumFilter, setPremiumFilter] = useState<string>("all");
  const [banFilter, setBanFilter] = useState<string>("all");

  // Selection & detail states
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [detailUser, setDetailUser] = useState<UserProfile | null>(null);

  // Metrics state
  const [metrics, setMetrics] = useState({
    totalUsers: 0,
    premiumUsers: 0,
    adminUsers: 0,
    bannedUsers: 0,
  });

  // Pagination state
  const [pageSize, setPageSize] = useState<number | "all">(5);
  const [page, setPage] = useState(0);
  const [totalUsers, setTotalUsers] = useState(0);

  // Reset page to 0 when filters change to avoid empty-result confusion
  useEffect(() => {
    setPage(0);
  }, [searchQuery, roleFilter, premiumFilter, banFilter]);

  // Load metrics
  const loadMetrics = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc("get_admin_metrics");

      if (error) {
        console.error(t("admin.metrics_error"), error);
        void reportFrontendError({
          source: "frontend:admin-user-manager",
          message: error.message || String(error),
          context: { action: "load-metrics" },
        });
        return;
      }

      setMetrics({
        totalUsers:   data?.totalUsers   ?? 0,
        premiumUsers: data?.premiumUsers ?? 0,
        adminUsers:   data?.adminUsers   ?? 0,
        bannedUsers:  data?.bannedUsers  ?? 0,
      });
    } catch (err) {
      console.error("Metrik exception:", err);
      void reportFrontendError({
        source: "frontend:admin-user-manager",
        message: err instanceof Error ? err.message : String(err),
        context: { action: "load-metrics" },
      });
    }
  }, [t]);

  // Confirmation Modal state
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    type: "warning" | "danger" | "info" | "success";
    action: () => Promise<void>;
  }>({
    isOpen: false,
    title: "",
    description: "",
    type: "info",
    action: async () => {}
  });

  const [actionLoading, setActionLoading] = useState<{ isOpen: boolean; message: string }>({
    isOpen: false,
    message: ""
  });

  // Fetch users with search, filters, and pagination purely built into Supabase
  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setUsersError(false);
    try {
      let query = supabase
        .from("users")
        .select("id, email, display_name, is_premium, is_banned, role", {
          count: "exact",
        });

      if (searchQuery.trim()) {
        const cleanSearch = searchQuery.trim();
        query = query.or(`display_name.ilike.%${cleanSearch}%,email.ilike.%${cleanSearch}%`);
      }

      if (roleFilter !== "all") {
        query = query.eq("role", roleFilter);
      }

      if (premiumFilter !== "all") {
        query = query.eq("is_premium", premiumFilter === "premium");
      }

      if (banFilter !== "all") {
        query = query.eq("is_banned", banFilter === "banned");
      }

      const limitVal = pageSize === "all" ? 1000000 : pageSize;
      const offsetVal = pageSize === "all" ? 0 : page * pageSize;

      query = query
        .order("created_at", { ascending: false })
        .range(offsetVal, offsetVal + limitVal - 1);

      const { data, count, error } = await query;

      if (error) {
        throw error;
      }

      // Cast returned rows properly to UserProfile
      const typedUsers: UserProfile[] = (data || []).map((u: any) => ({
        id: u.id,
        email: u.email || "",
        display_name: u.display_name || t("admin.guest_user"),
        is_premium: !!u.is_premium,
        is_banned: !!u.is_banned,
        role: (u.role as "owner" | "admin" | "user") || "user"
      }));

      setUsers(typedUsers);
      setTotalUsers(count || 0);
    } catch (err: any) {
      console.error(t("admin.fetch_error"), err);
      showToast(t("admin.fetch_error"), "error");
      setUsersError(true);
      void reportFrontendError({
        source: "frontend:admin-user-manager",
        message: err?.message || String(err),
        context: { action: "fetch-users", page, pageSize, searchQuery, roleFilter, premiumFilter, banFilter },
      });
    } finally {
      setLoading(false);
    }
  }, [t, showToast, page, pageSize, searchQuery, roleFilter, premiumFilter, banFilter]);

  useEffect(() => {
    if (isAdmin) {
      fetchUsers();
      loadMetrics();
    }
  }, [isAdmin, fetchUsers, loadMetrics, page, pageSize, searchQuery, roleFilter, premiumFilter, banFilter]);

  // Handle premium changes
  const handleTogglePremium = async (targetUser: UserProfile) => {
    audioFeedback.playClick();
    if (targetUser.role === "owner") {
      showToast(t("admin.owner_no_premium_change"), "error");
      return;
    }

    const nextPremium = !targetUser.is_premium;

    setConfirmModal({
      isOpen: true,
      title: t("premium.unlock_now"),
      description: t("admin.premium_success").replace("{name}", targetUser.display_name),
      type: "info",
      action: async () => {
        setActionLoading({ isOpen: true, message: "Memperbarui status premium..." });
        try {
          const { error } = await supabase.rpc("admin_set_premium", {
            p_target_user_id: targetUser.id,
            p_is_premium: nextPremium,
          });

          if (error) throw error;

          showToast(
            t("admin.premium_success").replace("{name}", targetUser.display_name),
            "success"
          );
          fetchUsers();
          loadMetrics();
        } catch (err: any) {
          console.error(err);
          showToast(err.message || "Failed to update", "error");
          void reportFrontendError({
            source: "frontend:admin-user-manager",
            message: err?.message || String(err),
            context: { action: "toggle-premium", targetUserId: targetUser.id, nextPremium },
          });
        } finally {
          setActionLoading({ isOpen: false, message: "" });
        }
      }
    });
  };

  // Handle ban / unban
  const handleToggleBan = async (targetUser: UserProfile) => {
    audioFeedback.playClick();
    if (targetUser.role === "owner") {
      showToast(t("admin.owner_no_ban"), "error");
      return;
    }

    if (targetUser.id === currentUser?.id) {
      showToast(t("admin.self_no_ban"), "error");
      return;
    }

    const nextBanned = !targetUser.is_banned;

    setConfirmModal({
      isOpen: true,
      title: nextBanned ? t("admin.suspend_title") : t("admin.restore_title"),
      description: t("admin.suspend_confirm")
        .replace("{action}", nextBanned ? t("admin.suspend_action") : t("admin.restore_action"))
        .replace("{name}", targetUser.display_name),
      type: nextBanned ? "danger" : "success",
      action: async () => {
        setActionLoading({ isOpen: true, message: nextBanned ? "Menangguhkan pengguna..." : "Mengaktifkan kembali pengguna..." });
        try {
          const { error } = await supabase.rpc("admin_set_ban", {
            p_target_user_id: targetUser.id,
            p_is_banned: nextBanned,
          });

          if (error) throw error;

          showToast(
            t("admin.action_success")
              .replace("{name}", targetUser.display_name)
              .replace("{status}", nextBanned ? t("admin.status_suspended") : t("admin.status_restored")),
            "success"
          );
          fetchUsers();
          loadMetrics();
        } catch (err: any) {
          console.error(err);
          showToast(err.message || "Failed", "error");
          void reportFrontendError({
            source: "frontend:admin-user-manager",
            message: err?.message || String(err),
            context: { action: "toggle-ban", targetUserId: targetUser.id, nextBanned },
          });
        } finally {
          setActionLoading({ isOpen: false, message: "" });
        }
      }
    });
  };

  // Handle role promo / demote
  const handleToggleRole = async (targetUser: UserProfile) => {
    audioFeedback.playClick();
    if (targetUser.role === "owner") {
      showToast(t("admin.owner_no_role_change"), "error");
      return;
    }

    if (targetUser.id === currentUser?.id) {
      showToast(t("admin.self_no_role_change"), "error");
      return;
    }

    const nextRole = targetUser.role === "admin" ? "user" : "admin";

    setConfirmModal({
      isOpen: true,
      title: t("admin.role_title"),
      description: t("admin.role_confirm")
        .replace("{name}", targetUser.display_name)
        .replace("{role}", nextRole.toUpperCase()),
      type: "warning",
      action: async () => {
        setActionLoading({ isOpen: true, message: "Mengubah role pengguna..." });
        try {
          const { error } = await supabase.rpc("admin_set_role", {
            p_target_user_id: targetUser.id,
            p_new_role: nextRole,
          });

          if (error) throw error;

          showToast(
            t("admin.role_success")
              .replace("{name}", targetUser.display_name)
              .replace("{role}", nextRole.toUpperCase()),
            "success"
          );
          fetchUsers();
          loadMetrics();
        } catch (err: any) {
          console.error(err);
          showToast(err.message || "Failed", "error");
          void reportFrontendError({
            source: "frontend:admin-user-manager",
            message: err?.message || String(err),
            context: { action: "toggle-role", targetUserId: targetUser.id, nextRole },
          });
        } finally {
          setActionLoading({ isOpen: false, message: "" });
        }
      }
    });
  };

  // Selection Checkbox handlers
  const toggleSelectUser = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    const selectableUsers = users.filter(u => u.role !== "owner" && u.id !== currentUser?.id);
    if (selectedIds.size === selectableUsers.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(selectableUsers.map(u => u.id)));
    }
  };

  // Bulk execution handler
  const handleBulkAction = async (action: "ban" | "unban" | "grant_premium" | "revoke_premium") => {
    if (selectedIds.size === 0) return;
    setBulkLoading(true);
    setActionLoading({ isOpen: true, message: `Memproses ${selectedIds.size} pengguna...` });
    let successCount = 0;
    try {
      const rpcName = (action === "ban" || action === "unban")
        ? "admin_set_ban"
        : "admin_set_premium";

      for (const id of Array.from(selectedIds)) {
        const { error } = await supabase.rpc(rpcName, {
          p_target_user_id: id,
          ...(action === "ban"            ? { p_is_banned: true }    : {}),
          ...(action === "unban"          ? { p_is_banned: false }   : {}),
          ...(action === "grant_premium"  ? { p_is_premium: true }   : {}),
          ...(action === "revoke_premium" ? { p_is_premium: false }  : {}),
        });
        if (!error) successCount++;
      }

      showToast(`${successCount} dari ${selectedIds.size} pengguna berhasil diperbarui.`, "success");
      setSelectedIds(new Set());
      fetchUsers();
      loadMetrics();
    } catch (err: any) {
      showToast(err.message || "Bulk action gagal", "error");
      void reportFrontendError({
        source: "frontend:admin-user-manager",
        message: err?.message || String(err),
        context: { action: "bulk-action", bulkAction: action, count: selectedIds.size },
      });
    } finally {
      setBulkLoading(false);
      setActionLoading({ isOpen: false, message: "" });
    }
  };

  // Export CSV Handler
  const handleExportCSV = async () => {
    try {
      const { data, error } = await supabase
        .from("users")
        .select("id, email, display_name, role, is_premium, is_banned, telegram_chat_id, created_at");

      if (error) throw error;

      const headers = ["ID", "Email", "Nama", "Role", "Premium", "Status", "Telegram Chat ID", "Tanggal Daftar"];
      const rows = (data || []).map(u => [
        u.id,
        u.email || "",
        u.display_name || "",
        u.role || "user",
        u.is_premium ? "Ya" : "Tidak",
        u.is_banned ? "Suspended" : "Aktif",
        u.telegram_chat_id || "",
        u.created_at ? new Date(u.created_at).toLocaleString(locale === "id" ? "id-ID" : "en-US") : ""
      ]);

      const csvContent = [headers, ...rows]
        .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(","))
        .join("\n");

      const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `ewallet-users-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      showToast("Data pengguna berhasil diekspor ke CSV", "success");
    } catch (err: any) {
      showToast(err.message || "Gagal ekspor CSV", "error");
      void reportFrontendError({
        source: "frontend:admin-user-manager",
        message: err?.message || String(err),
        context: { action: "export-csv" },
      });
    }
  };

  return (
    <div className="space-y-5">

      <div className="relative">
        <div>
          <AdminBackBar />
        </div>
      </div>

      {/* Header + quick actions -- Wrapped in One Card Container, konsisten
          dengan pola header di halaman Admin* lainnya (mis. AdminPremiumMonitor). */}
      <div className={cx("overflow-hidden rounded-3xl border shadow-sm", tokens.surface.card, tokens.border.accent)}>
        <div className="h-1.5 w-full bg-gradient-to-r from-indigo-600 via-indigo-500 to-indigo-400" />
        <div className="p-6 md:p-8 space-y-6">
          <div className={cx("flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-6", tokens.border.default)}>
            <div>
              <h1 className={cx("font-sans font-bold text-2xl tracking-tight flex items-center gap-2", tokens.text.heading)}>
                <User className={cx(tokens.text.accent)} size={24} />
                {t("admin.tab_users")}
              </h1>
              <p className={cx("font-sans text-sm mt-1 font-medium", tokens.text.muted)}>
                {t("admin.tab_users_desc")}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                onClick={handleExportCSV}
                className="px-4 py-2 text-xs font-bold rounded-xl border border-emerald-600 bg-emerald-600 hover:bg-emerald-500 text-white transition-colors cursor-pointer"
              >
                ↓ Export CSV
              </button>
              <button
                onClick={() => {
                  fetchUsers();
                  loadMetrics();
                }}
                className={cx("px-4 py-2 text-xs font-bold rounded-xl border transition-colors cursor-pointer", tokens.border.default, tokens.hover.surface, tokens.surface.card, tokens.text.secondary)}
              >
                {t("admin.refresh")}
              </button>
            </div>
          </div>

          {/* Metrics Cards Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className={cx("rounded-2xl border p-4 shadow-sm space-y-2", tokens.surface.sunken, tokens.border.default)}>
              <p className={cx("font-sans text-[clamp(0.5625rem,2.6vw,0.625rem)] uppercase font-black tracking-wider", tokens.text.mutedAlt)}>
                {t("admin.metrics.total")}
              </p>
              <h2 className={cx("font-sans font-black text-2xl", tokens.text.heading)}>
                {metrics.totalUsers}
              </h2>
              <div className={cx("h-1 rounded-full overflow-hidden", tokens.surface.subtle)}>
                <div className="h-full rounded-full bg-indigo-500" style={{ width: "100%" }} />
              </div>
            </div>

            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 shadow-sm space-y-2">
              <p className={cx("font-sans text-[clamp(0.5625rem,2.6vw,0.625rem)] uppercase font-black tracking-wider", tokens.text.warning)}>
                {t("admin.metrics.premium")}
              </p>
              <h2 className={cx("font-sans font-black text-2xl", tokens.text.warning)}>
                {metrics.premiumUsers}
              </h2>
              <div className="h-1 rounded-full overflow-hidden bg-amber-500/15">
                <div className="h-full rounded-full bg-amber-500 transition-all duration-700"
                  style={{ width: metrics.totalUsers > 0 ? `${Math.round((metrics.premiumUsers / metrics.totalUsers) * 100)}%` : "0%" }} />
              </div>
              <p className="text-[clamp(0.5625rem,2.6vw,0.625rem)] text-amber-400/60">
                {metrics.totalUsers > 0 ? `${Math.round((metrics.premiumUsers / metrics.totalUsers) * 100)}% dari total` : "—"}
              </p>
            </div>

            <div className={cx("rounded-2xl border p-4 shadow-sm space-y-2", tokens.admin.metricsAdminBgBorder)}>
              <p className={cx("font-sans text-[clamp(0.5625rem,2.6vw,0.625rem)] uppercase font-black tracking-wider", tokens.text.accent)}>
                {t("admin.metrics.admin")}
              </p>
              <h2 className={cx("font-sans font-black text-2xl", tokens.text.accent)}>
                {metrics.adminUsers}
              </h2>
              <div className="h-1 rounded-full overflow-hidden bg-indigo-500/15">
                <div className="h-full rounded-full bg-indigo-500 transition-all duration-700"
                  style={{ width: metrics.totalUsers > 0 ? `${Math.round((metrics.adminUsers / metrics.totalUsers) * 100)}%` : "0%" }} />
              </div>
            </div>

            <div className={cx("rounded-2xl border p-4 shadow-sm space-y-2", tokens.admin.metricsSuspendedBgBorder)}>
              <p className={cx("font-sans text-[clamp(0.5625rem,2.6vw,0.625rem)] uppercase font-black tracking-wider", tokens.text.danger)}>
                {t("admin.metrics.suspended")}
              </p>
              <h2 className={cx("font-sans font-black text-2xl", tokens.text.danger)}>
                {metrics.bannedUsers}
              </h2>
              <div className="h-1 rounded-full overflow-hidden bg-red-500/15">
                <div className="h-full rounded-full bg-red-500 transition-all duration-700"
                  style={{ width: metrics.totalUsers > 0 ? `${Math.round((metrics.bannedUsers / metrics.totalUsers) * 100)}%` : "0%" }} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Control panel (Search & filters) - Wrapped in One Card Container */}
      <div className={cx("p-5 rounded-2xl border shadow-sm", tokens.surface.card, tokens.border.default)}>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="relative">
            <Search className={cx("absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500", tokens.text.accent)} size={16} />
            <Input
              size="compact"
              type="text"
              placeholder={t("admin.search_placeholder")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 font-sans text-xs"
            />
          </div>

          <div>
            <DropdownField
              value={roleFilter}
              onChange={setRoleFilter}
              options={[
                { value: "all", label: `${t("admin.filter_role")}: ${t("common.all")}` },
                { value: "owner", label: `${t("admin.filter_role")}: Owner` },
                { value: "admin", label: `${t("admin.filter_role")}: Admin` },
                { value: "user", label: `${t("admin.filter_role")}: User` },
              ]}
            />
          </div>

          <div>
            <DropdownField
              value={premiumFilter}
              onChange={setPremiumFilter}
              options={[
                { value: "all", label: `${t("admin.filter_premium")}: ${t("common.all")}` },
                { value: "premium", label: `${t("admin.filter_premium")}: ${t("admin.status_active")}` },
                { value: "normal", label: `${t("admin.filter_premium")}: ${t("admin.premium_lite")}` },
              ]}
            />
          </div>

          <div>
            <DropdownField
              value={banFilter}
              onChange={setBanFilter}
              options={[
                { value: "all", label: `${t("admin.filter_status")}: ${t("common.all")}` },
                { value: "normal", label: `${t("admin.filter_status")}: ${t("admin.status_active")}` },
                { value: "banned", label: `${t("admin.filter_status")}: ${t("admin.metrics.suspended")}` },
              ]}
            />
          </div>
        </div>
      </div>

      {/* Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className={cx("flex flex-col md:flex-row md:items-center justify-between gap-3 px-6 py-4 rounded-2xl border", tokens.admin.bulkActionBgBorder)}>
          <span className={cx("text-xs font-bold", tokens.text.accent)}>
            {t("admin.users_selected").replace("{count}", selectedIds.size.toString())}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {[
              { label: "Grant Premium",  action: "grant_premium"  as const, color: tokens.admin.bulkActionBtnGrant },
              { label: "Revoke Premium", action: "revoke_premium" as const, color: cx("border text-slate-400 hover:text-white light_sakura:hover:text-slate-900 transition-colors", tokens.border.default, tokens.hover.surface, tokens.surface.card) },
              { label: "Ban Semua",      action: "ban"            as const, color: "text-red-400 border-red-500/30 bg-red-500/15 hover:bg-red-500/25 light_sakura:bg-red-50 light_sakura:text-red-600 light_sakura:border-red-200 light_sakura:hover:bg-red-100" },
              { label: "Unban Semua",    action: "unban"          as const, color: "text-emerald-400 border-emerald-500/30 bg-emerald-500/15 hover:bg-emerald-500/25 light_sakura:bg-emerald-50 light_sakura:text-emerald-600 light_sakura:border-emerald-200 light_sakura:hover:bg-emerald-100" },
            ].map(({ label, action, color }) => (
              <button
                key={action}
                disabled={bulkLoading}
                onClick={() => handleBulkAction(action)}
                className={`px-3 py-1.5 text-[clamp(0.5625rem,2.6vw,0.625rem)] font-black uppercase rounded-xl border cursor-pointer transition-colors disabled:opacity-50 ${color}`}
              >
                {label}
              </button>
            ))}
            <button
              onClick={() => setSelectedIds(new Set())}
              className={cx("px-3 py-1.5 text-[clamp(0.5625rem,2.6vw,0.625rem)] font-black uppercase rounded-xl border hover:text-white light_sakura:hover:text-slate-900 cursor-pointer transition-colors", tokens.border.default, tokens.hover.surface, tokens.text.secondary)}
            >
              {t("admin.clear_selection")}
            </button>
          </div>
        </div>
      )}

      {/* Main Users Table - Wrapped in One Card Container */}
      <div className={cx("p-5 rounded-2xl border shadow-sm overflow-hidden", tokens.surface.card, tokens.border.default)}>
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center space-y-3">
            <Clock className={cx("animate-spin", tokens.icon.accent)} size={32} />
            <p className="font-sans text-xs text-slate-400">
              {t("admin.loading")}
            </p>
          </div>
        ) : usersError ? (
          <ErrorState onRetry={fetchUsers} />
        ) : users.length === 0 ? (
          <EmptyState
            icon={<User size={40} className={cx(tokens.text.faint)} />}
            title={t("admin.no_users")}
            description={t("admin.no_users_desc")}
          />
        ) : (
            <ScrollableTableWrapper>
            <table className="w-full text-left border-collapse table-auto min-w-[900px]">
              <thead>
                <tr className={cx("border-b text-[clamp(0.5625rem,2.6vw,0.625rem)] font-bold uppercase tracking-wider", tokens.border.default, tokens.surface.subtle, tokens.text.mutedAlt, tokens.divide.tableColumn)}>
                  <th className="px-4 py-4 w-10">
                    <input
                       type="checkbox"
                       onChange={toggleSelectAll}
                       checked={selectedIds.size > 0 && selectedIds.size === users.filter(u => u.role !== "owner" && u.id !== currentUser?.id).length}
                       className={cx("w-3.5 h-3.5 cursor-pointer", tokens.admin.tableCheckboxAccent)}
                    />
                  </th>
                  <th className="px-6 py-4">{t("admin.table_user")}</th>
                  <th className="px-6 py-4">{t("admin.table_email")}</th>
                  <th className="px-6 py-4">{t("admin.table_membership")}</th>
                  <th className="px-6 py-4">{t("admin.table_role")}</th>
                  <th className="px-6 py-4">{t("admin.table_access")}</th>
                  <th className="px-6 py-4 text-right">{t("admin.table_actions")}</th>
                </tr>
              </thead>
              <tbody className={cx("divide-y", tokens.admin.tableDivide)}>
                {users.map((user) => {
                  const isSelf = user.id === currentUser?.id;
                  return (
                    <tr
                      key={user.id}
                      className={cx("transition-all duration-150", tokens.hover.surface, user.is_banned ? "bg-red-950/10" : "", tokens.divide.tableColumn)}
                    >
                      {/* Checkbox column */}
                      <td className="px-4 py-4">
                        {user.role !== "owner" && !isSelf && (
                          <input
                            type="checkbox"
                            checked={selectedIds.has(user.id)}
                            onChange={() => toggleSelectUser(user.id)}
                            className={cx("w-3.5 h-3.5 cursor-pointer", tokens.admin.tableCheckboxAccent)}
                          />
                        )}
                      </td>

                      {/* Name Card */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className={cx("w-8 h-8 rounded-xl font-bold flex items-center justify-center shrink-0", 
                             user.is_banned ? "bg-red-500/20 text-red-400" : cx(tokens.surface.subtle, tokens.text.accent))}>
                            {user.display_name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <span className={cx("font-sans font-bold text-xs block", tokens.text.onSurface)}>
                              {user.display_name} {isSelf && t("admin.self_label")}
                            </span>
                            <span className="font-mono text-[clamp(0.5062rem,2.34vw,0.5625rem)] text-slate-400 block">
                              ID: {user.id.slice(0, 8)}...
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Email */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className={cx("flex items-center gap-1.5 font-sans text-xs", tokens.text.label)}>
                           <Mail size={12} className="text-slate-500 shrink-0" />
                           <span>{user.email || t("admin.no_email")}</span>
                        </div>
                      </td>

                      {/* Premium Toggle Column */}
                      <td className="px-6 py-4">
                        <button
                          disabled={user.role === "owner"}
                          onClick={() => handleTogglePremium(user)}
                          className="focus:outline-none text-left cursor-pointer transition-transform active:scale-95 block disabled:opacity-50 disabled:cursor-not-allowed"
                          title={t("admin.refresh")}
                        >
                          {user.is_premium ? (
                            <Badge tone="warning" className="normal-case">
                              {t("admin.premium_active")}
                            </Badge>
                          ) : (
                            <Badge tone="neutral" className="normal-case">
                              {t("admin.premium_lite")}
                            </Badge>
                          )}
                        </button>
                      </td>

                      {/* Role column */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <Badge
                            tone={
                              user.role === "owner"
                                ? "danger"
                                : user.role === "admin"
                                ? "info"
                                : "neutral"
                            }
                          >
                            {user.role}
                          </Badge>
                        </div>
                      </td>

                      {/* Suspend Status */}
                      <td className="px-6 py-4">
                        {user.is_banned ? (
                          <Badge tone="danger" icon={<XCircle size={10} />}>
                            {t("admin.status_suspended")}
                          </Badge>
                        ) : (
                          <Badge tone="success" icon={<CheckCircle size={10} />}>
                            {t("admin.status_active")}
                          </Badge>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Detail User button */}
                          <button
                            onClick={() => {
                              audioFeedback.playClick();
                              setDetailUser(user);
                            }}
                            className={cx("p-1 px-2.5 text-[clamp(0.5625rem,2.6vw,0.625rem)] font-bold border rounded-lg transition-all focus:outline-none cursor-pointer flex items-center gap-1", tokens.border.default, tokens.hover.surface, tokens.surface.card, tokens.text.label)}
                            title={t("admin.user_detail_title")}
                          >
                            <User size={10} />
                            <span>Detail</span>
                          </button>

                          {/* Role Toggle Trigger */}
                          <button
                            disabled={isSelf || user.role === "owner" || !isOwner}
                            onClick={() => handleToggleRole(user)}
                            className={cx("p-1 px-2.5 text-[clamp(0.5625rem,2.6vw,0.625rem)] font-bold border rounded-lg transition-all focus:outline-none disabled:opacity-20 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1", tokens.border.default, tokens.hover.surface, tokens.surface.card, tokens.text.label)}
                            title={t("admin.role_title")}
                          >
                            <Shield size={10} />
                            <span>{user.role === "admin" ? t("admin.demote") : t("admin.make_admin")}</span>
                          </button>

                          {/* Ban Toggle Trigger */}
                          <button
                            disabled={isSelf || user.role === "owner"}
                            onClick={() => handleToggleBan(user)}
                            className={cx("p-1.5 rounded-lg border transition-all focus:outline-none disabled:opacity-20 disabled:cursor-not-allowed cursor-pointer",
                              user.is_banned
                                ? cx("border-emerald-500/30 bg-emerald-500/15 hover:bg-emerald-500/25 light_sakura:bg-emerald-50 light_sakura:border-emerald-200 light_sakura:hover:bg-emerald-100", tokens.text.success)
                                : cx("border-red-500/30 bg-red-500/15 hover:bg-red-500/25 light_sakura:bg-red-50 light_sakura:border-red-200 light_sakura:hover:bg-red-100", tokens.text.danger))}
                            title={user.is_banned ? t("admin.restore_title") : t("admin.suspend_title")}
                          >
                            {user.is_banned ? <UserCheck size={12} /> : <UserX size={12} />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </ScrollableTableWrapper>
        )}
      </div>

      {/* Pagination controls */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-2 font-sans text-xs text-slate-400">
        {/* Page Size Selector */}
        <div className="flex items-center gap-2">
          <span>{t("admin.rows_per_page")}</span>
          <DropdownField
            className="w-24"
            value={String(pageSize)}
            onChange={(v) => {
              setPageSize(v === "all" ? "all" : Number(v));
              setPage(0);
            }}
            options={[
              { value: "5", label: "5" },
              { value: "10", label: "10" },
              { value: "15", label: "15" },
              { value: "20", label: "20" },
              { value: "all", label: t("common.all") },
            ]}
          />
        </div>

        {/* Pagination Info & Buttons */}
        {pageSize !== "all" && totalUsers > pageSize ? (
          <div className="flex items-center gap-4">
            <div>
              {t("admin.pagination_info")
                .replace("{start}", (page * pageSize + 1).toString())
                .replace("{end}", Math.min((page + 1) * pageSize, totalUsers).toString())
                .replace("{total}", totalUsers.toString())
              }
            </div>
            <div className="flex items-center gap-2">
              <button
                disabled={page === 0}
                onClick={() => {
                  audioFeedback.playClick();
                  setPage(p => Math.max(0, p - 1));
                }}
                className={cx("px-3 py-1.5 rounded-lg border disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors", tokens.border.default, tokens.hover.surface, tokens.surface.card, tokens.text.secondary)}
              >
                {t("admin.prev")}
              </button>
              <span className={cx("px-3 py-1 rounded-md border", tokens.surface.sunken, tokens.border.default)}>
                {page + 1} / {Math.ceil(totalUsers / pageSize)}
              </span>
              <button
                disabled={(page + 1) * pageSize >= totalUsers}
                onClick={() => {
                  audioFeedback.playClick();
                  setPage(p => p + 1);
                }}
                className={cx("px-3 py-1.5 rounded-lg border disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors", tokens.border.default, tokens.hover.surface, tokens.surface.card, tokens.text.secondary)}
              >
                {t("admin.next")}
              </button>
            </div>
          </div>
        ) : (
          <div className="text-slate-500">
            {t("admin.showing_all_users").replace("{count}", totalUsers.toString())}
          </div>
        )}
      </div>

      {/* Global detail user modal */}
      <AdminUserDetailModal
        user={detailUser}
        onClose={() => setDetailUser(null)}
      />

      {/* Confirmation helper Modal */}
      <Modal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        description={confirmModal.description}
        type={confirmModal.type}
        confirmLabel={t("admin.proceed")}
        cancelLabel={t("admin.cancel")}
        onConfirm={async () => {
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
          await confirmModal.action();
        }}
        onCancel={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
      />

      {/* Loading overlay for in-progress actions */}
      <LoadingOverlay isOpen={actionLoading.isOpen} message={actionLoading.message} />

    </div>
  );
};
