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
import { 
  Shield, 
  User, 
  Mail, 
  ShieldCheck, 
  ShieldX, 
  Ban, 
  UserCheck, 
  Search, 
  CheckCircle, 
  XCircle,
  Clock,
  UserX,
  ChevronDown
} from "lucide-react";
import { motion } from "motion/react";
import { Modal } from "../components/Modal";
import { ScrollableTableWrapper } from "../components/ScrollableTableWrapper";
import { LoadingOverlay } from "../components/LoadingOverlay";

// Import other panel views and components
import { AdminPremiumMonitor } from "./AdminPremiumMonitor";
import { AdminCategoryManager } from "./AdminCategoryManager";
import { AdminBroadcast } from "./AdminBroadcast";
import { AdminAiMonitor } from "./AdminAiMonitor";
import { AdminErrorMonitor } from "./AdminErrorMonitor";
import { AdminMaintenance } from "./AdminMaintenance";
import { AdminVoucherManager } from "./AdminVoucherManager";
import { AdminUserDetailModal } from "../components/AdminUserDetailModal";

type AdminTab = "users" | "premium" | "voucher" | "categories" | "broadcast" | "ai_monitor" | "error_monitor" | "maintenance";

export const AdminPanel: React.FC = () => {
  const { t, locale } = useLanguage();
  const { showToast } = useToast();
  const { user: currentUser } = useAuth();
  const { isAdmin, isOwner } = useAdmin();

  const [activeTab, setActiveTab] = useState<AdminTab>("users");
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
  const [pageSize, setPageSize] = useState<number | "all">(20);
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
    }
  };

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6 bg-slate-950/20 rounded-3xl border border-red-500/10">
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

  return (
    <div className="space-y-6">
      
      {/* Upper header section */}
      <div className="rounded-3xl border border-slate-800 light_sakura:border-slate-100 shadow-sm overflow-hidden bg-slate-900 light_sakura:bg-white">
        <div className="h-1.5 w-full bg-gradient-to-r from-indigo-600 via-indigo-500 to-indigo-400" />
        <div className="p-6 md:p-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="font-sans font-bold text-2xl tracking-tight text-white light_sakura:text-slate-900 flex items-center gap-2">
                <Shield className="text-indigo-400 light_sakura:text-rose-500" />
                <span>{t("nav.admin_panel")}</span>
              </h1>
              <p className="font-sans text-xs text-slate-400 mt-1 light_sakura:text-slate-500">
                {t("admin.panel_desc")}
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              {activeTab === "users" && (
                <button
                  onClick={handleExportCSV}
                  className="px-4 py-2 text-xs font-bold rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors cursor-pointer"
                >
                  ↓ Export CSV
                </button>
              )}
              <button 
                onClick={() => {
                  fetchUsers();
                  loadMetrics();
                }}
                className="px-4 py-2 text-xs font-bold rounded-xl border border-slate-800 hover:bg-slate-800 transition-colors cursor-pointer text-slate-300 light_sakura:border-rose-200 light_sakura:text-slate-700 light_sakura:hover:bg-rose-100"
              >
                {t("admin.refresh")}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Tab Navigation links */}
      <div className="bg-slate-900 light_sakura:bg-white px-4 py-3 rounded-2xl border border-slate-800 light_sakura:border-slate-100 shadow-sm">
        <div className="flex gap-1 overflow-x-auto">
          {([
            { key: "users",       label: t("admin.tab_users") },
            { key: "premium",     label: t("admin.tab_premium") },
            { key: "voucher",     label: t("admin.tab_voucher") },
            { key: "categories",  label: t("admin.tab_categories") },
            { key: "broadcast",   label: t("admin.tab_broadcast") },
            { key: "ai_monitor",  label: t("admin.tab_ai_monitor") },
            { key: "error_monitor", label: t("admin.tab_error_monitor") },
            { key: "maintenance", label: t("admin.tab_maintenance") },
          ] as { key: AdminTab; label: string }[]).map(tab => (
            <button
              key={tab.key}
              onClick={() => {
                audioFeedback.playClick();
                setActiveTab(tab.key);
              }}
              className={`px-4 py-2.5 text-xs font-black whitespace-nowrap rounded-xl transition-all cursor-pointer border
                ${activeTab === tab.key
                  ? "bg-indigo-500/10 text-indigo-400 border-indigo-500/20 light_sakura:bg-rose-100 light_sakura:text-rose-600 light_sakura:border-rose-200"
                  : "text-slate-400 hover:text-slate-200 light_sakura:text-slate-500 light_sakura:hover:text-slate-800"}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Contents: Users List */}
      {activeTab === "users" && (
        <>
          {/* Metrics Cards Grid - Wrapped in One Card Container */}
          <div className="bg-slate-900 light_sakura:bg-white p-6 md:p-8 rounded-3xl border border-slate-800 light_sakura:border-slate-100 shadow-sm">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4 shadow-sm light_sakura:bg-rose-100/10 light_sakura:border-rose-200 space-y-2">
                <p className="font-sans text-[clamp(0.5625rem,2.6vw,0.625rem)] uppercase font-black tracking-wider text-slate-400 light_sakura:text-slate-600">
                  {t("admin.metrics.total")}
                </p>
                <h2 className="font-sans font-black text-2xl text-slate-100 light_sakura:text-slate-900">
                  {metrics.totalUsers}
                </h2>
                <div className="h-1 rounded-full bg-slate-800 overflow-hidden light_sakura:bg-rose-100">
                  <div className="h-full rounded-full bg-indigo-500" style={{ width: "100%" }} />
                </div>
              </div>

              <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 shadow-sm light_sakura:bg-amber-100/30 light_sakura:border-amber-200 space-y-2">
                <p className="font-sans text-[clamp(0.5625rem,2.6vw,0.625rem)] uppercase font-black tracking-wider text-amber-400/80 light_sakura:text-amber-600">
                  {t("admin.metrics.premium")}
                </p>
                <h2 className="font-sans font-black text-2xl text-amber-400 light_sakura:text-amber-600">
                  {metrics.premiumUsers}
                </h2>
                <div className="h-1 rounded-full bg-amber-900/30 overflow-hidden light_sakura:bg-amber-100">
                  <div className="h-full rounded-full bg-amber-500 transition-all duration-700"
                    style={{ width: metrics.totalUsers > 0 ? `${Math.round((metrics.premiumUsers / metrics.totalUsers) * 100)}%` : "0%" }} />
                </div>
                <p className="text-[clamp(0.5625rem,2.6vw,0.625rem)] text-amber-400/60">
                  {metrics.totalUsers > 0 ? `${Math.round((metrics.premiumUsers / metrics.totalUsers) * 100)}% dari total` : "—"}
                </p>
              </div>

              <div className="rounded-2xl border border-indigo-500/20 bg-indigo-500/5 p-4 shadow-sm light_sakura:bg-indigo-100/30 light_sakura:border-indigo-200 space-y-2">
                <p className="font-sans text-[clamp(0.5625rem,2.6vw,0.625rem)] uppercase font-black tracking-wider text-indigo-400/80 light_sakura:text-indigo-600">
                  {t("admin.metrics.admin")}
                </p>
                <h2 className="font-sans font-black text-2xl text-indigo-400 light_sakura:text-indigo-600">
                  {metrics.adminUsers}
                </h2>
                <div className="h-1 rounded-full bg-indigo-900/30 overflow-hidden light_sakura:bg-indigo-100">
                  <div className="h-full rounded-full bg-indigo-500 transition-all duration-700"
                    style={{ width: metrics.totalUsers > 0 ? `${Math.round((metrics.adminUsers / metrics.totalUsers) * 100)}%` : "0%" }} />
                </div>
              </div>

              <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-4 shadow-sm light_sakura:bg-red-100/30 light_sakura:border-red-200 space-y-2">
                <p className="font-sans text-[clamp(0.5625rem,2.6vw,0.625rem)] uppercase font-black tracking-wider text-red-400/80 light_sakura:text-red-600">
                  {t("admin.metrics.suspended")}
                </p>
                <h2 className="font-sans font-black text-2xl text-red-400/80 light_sakura:text-red-600">
                  {metrics.bannedUsers}
                </h2>
                <div className="h-1 rounded-full bg-red-900/30 overflow-hidden light_sakura:bg-red-100">
                  <div className="h-full rounded-full bg-red-500 transition-all duration-700"
                    style={{ width: metrics.totalUsers > 0 ? `${Math.round((metrics.bannedUsers / metrics.totalUsers) * 100)}%` : "0%" }} />
                </div>
              </div>
            </div>
          </div>

          {/* Control panel (Search & filters) - Wrapped in One Card Container */}
          <div className="bg-slate-900 light_sakura:bg-white p-6 md:p-8 rounded-3xl border border-slate-800 light_sakura:border-slate-100 shadow-sm">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 light_sakura:text-rose-400" size={16} />
                <input
                  type="text"
                  placeholder={t("admin.search_placeholder")}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl font-sans text-xs bg-slate-900 border border-slate-800 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 light_sakura:bg-slate-50 light_sakura:border-rose-200 light_sakura:text-slate-800 light_sakura:placeholder-slate-400"
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
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 px-6 py-4 rounded-3xl border border-indigo-500/20 bg-indigo-500/5 light_sakura:bg-rose-50 light_sakura:border-rose-200">
              <span className="text-xs font-bold text-indigo-400 light_sakura:text-rose-600">
                {t("admin.users_selected").replace("{count}", selectedIds.size.toString())}
              </span>
              <div className="flex flex-wrap items-center gap-2">
                {[
                  { label: "Grant Premium",  action: "grant_premium"  as const, color: "text-amber-400 border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 light_sakura:bg-amber-500/5" },
                  { label: "Revoke Premium", action: "revoke_premium" as const, color: "text-slate-400 border-slate-700 bg-slate-800 hover:bg-slate-700 light_sakura:bg-white" },
                  { label: "Ban Semua",      action: "ban"            as const, color: "text-red-400 border-red-500/30 bg-red-500/10 hover:bg-red-500/20" },
                  { label: "Unban Semua",    action: "unban"          as const, color: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20" },
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
                  className="px-3 py-1.5 text-[clamp(0.5625rem,2.6vw,0.625rem)] font-black uppercase rounded-xl border border-slate-800 text-slate-400 hover:bg-slate-900 cursor-pointer light_sakura:border-rose-200"
                >
                  {t("admin.clear_selection")}
                </button>
              </div>
            </div>
          )}

          {/* Main Users Table - Wrapped in One Card Container */}
          <div className="bg-slate-900 light_sakura:bg-white p-6 md:p-8 rounded-3xl border border-slate-800 light_sakura:border-slate-100 shadow-sm overflow-hidden">
            {loading ? (
              <div className="py-20 flex flex-col items-center justify-center space-y-3">
                <Clock className="animate-spin text-indigo-400 light_sakura:text-rose-500" size={32} />
                <p className="font-sans text-xs text-slate-400">
                  {t("admin.loading")}
                </p>
              </div>
            ) : usersError ? (
              <ErrorState onRetry={fetchUsers} />
            ) : users.length === 0 ? (
              <EmptyState
                icon={<User size={40} className="text-slate-600 light_sakura:text-slate-400" />}
                title={t("admin.no_users")}
                description={t("admin.no_users_desc")}
              />
            ) : (
                <ScrollableTableWrapper>
                <table className="w-full text-left border-collapse table-auto min-w-[900px]">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-800/60 text-[clamp(0.5625rem,2.6vw,0.625rem)] font-bold text-slate-400 uppercase tracking-wider light_sakura:bg-rose-100/30 light_sakura:border-rose-200 light_sakura:text-slate-600">
                      <th className="px-4 py-4 w-10">
                        <input
                           type="checkbox"
                           onChange={toggleSelectAll}
                           checked={selectedIds.size > 0 && selectedIds.size === users.filter(u => u.role !== "owner" && u.id !== currentUser?.id).length}
                           className="w-3.5 h-3.5 accent-teal-500 light_sakura:accent-rose-500 cursor-pointer"
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
                  <tbody className="divide-y divide-slate-800 light_sakura:divide-rose-100/20">
                    {users.map((user) => {
                      const isSelf = user.id === currentUser?.id;
                      return (
                        <tr 
                          key={user.id} 
                          className={`hover:bg-slate-800/50 transition-all duration-150 ${user.is_banned ? "bg-red-950/10" : ""} light_sakura:hover:bg-rose-50/50`}
                        >
                          {/* Checkbox column */}
                          <td className="px-4 py-4">
                            {user.role !== "owner" && !isSelf && (
                              <input
                                type="checkbox"
                                checked={selectedIds.has(user.id)}
                                onChange={() => toggleSelectUser(user.id)}
                                className="w-3.5 h-3.5 accent-teal-500 light_sakura:accent-rose-500 cursor-pointer"
                              />
                            )}
                          </td>

                          {/* Name Card */}
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className={`w-8 h-8 rounded-xl font-bold flex items-center justify-center shrink-0 
                                 ${user.is_banned ? "bg-red-500/20 text-red-400" : "bg-slate-800 text-indigo-400 light_sakura:bg-rose-100 light_sakura:text-rose-600"}`}>
                                {user.display_name.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <span className="font-sans font-bold text-xs text-white light_sakura:text-slate-800 block">
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
                            <div className="flex items-center gap-1.5 font-sans text-xs text-slate-300 light_sakura:text-slate-600">
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
                                <span className="px-2 py-1 text-[clamp(0.5062rem,2.34vw,0.5625rem)] font-extrabold tracking-wider bg-amber-500/15 text-amber-400 border border-amber-500/30 rounded-lg flex items-center gap-1 inline-flex hover:bg-amber-500/25 light_sakura:bg-amber-100 light_sakura:text-amber-700 light_sakura:border-amber-200">
                                  👑 {t("admin.premium_active")}
                                </span>
                              ) : (
                                <span className="px-2 py-1 text-[clamp(0.5062rem,2.34vw,0.5625rem)] font-extrabold tracking-wider bg-slate-800 text-slate-400 border border-slate-700 rounded-lg hover:bg-slate-700/50 inline-flex light_sakura:bg-slate-100 light_sakura:text-slate-600 light_sakura:border-slate-200">
                                  {t("admin.premium_lite")}
                                </span>
                              )}
                            </button>
                          </td>

                          {/* Role column */}
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <span className={`px-2 py-1 text-[clamp(0.5062rem,2.34vw,0.5625rem)] font-extrabold tracking-wider rounded-lg uppercase border
                                ${user.role === "owner" ? "bg-red-500/10 text-red-400 border-red-500/20 light_sakura:bg-red-100 light_sakura:text-red-700 light_sakura:border-red-200" :
                                  user.role === "admin" ? "bg-indigo-500/10 text-indigo-400 border-indigo-500/20 light_sakura:bg-indigo-100 light_sakura:text-indigo-700 light_sakura:border-indigo-200" : 
                                  "bg-slate-800 text-slate-400 border-slate-700 light_sakura:bg-slate-100 light_sakura:text-slate-600 light_sakura:border-slate-200"}`}>
                                {user.role}
                              </span>
                            </div>
                          </td>

                          {/* Suspend Status */}
                          <td className="px-6 py-4">
                            {user.is_banned ? (
                              <span className="px-2 py-1 text-[clamp(0.5062rem,2.34vw,0.5625rem)] font-extrabold tracking-wider bg-red-500/15 text-red-500 border border-red-500/35 rounded-lg flex items-center gap-1 inline-flex uppercase light_sakura:bg-red-100 light_sakura:text-red-700 light_sakura:border-red-200">
                                <XCircle size={10} />
                                {t("admin.status_suspended")}
                              </span>
                            ) : (
                              <span className="px-2 py-1 text-[clamp(0.5062rem,2.34vw,0.5625rem)] font-extrabold tracking-wider bg-emerald-500/15 text-emerald-400 border border-emerald-500/35 rounded-lg flex items-center gap-1 inline-flex uppercase light_sakura:bg-emerald-100 light_sakura:text-emerald-700 light_sakura:border-emerald-200">
                                <CheckCircle size={10} />
                                {t("admin.status_active")}
                              </span>
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
                                className="p-1 px-2.5 text-[clamp(0.5625rem,2.6vw,0.625rem)] font-bold text-slate-300 border border-slate-800 hover:bg-slate-900 hover:text-white hover:border-slate-700 rounded-lg transition-all focus:outline-none cursor-pointer flex items-center gap-1 light_sakura:border-rose-200 light_sakura:text-slate-600 light_sakura:hover:bg-rose-100"
                                title={t("admin.user_detail_title")}
                              >
                                <User size={10} />
                                <span>Detail</span>
                              </button>

                              {/* Role Toggle Trigger */}
                              <button
                                disabled={isSelf || user.role === "owner" || !isOwner}
                                onClick={() => handleToggleRole(user)}
                                className="p-1 px-2.5 text-[clamp(0.5625rem,2.6vw,0.625rem)] font-bold text-slate-300 border border-slate-800 hover:bg-slate-900 hover:text-white hover:border-slate-700 rounded-lg transition-all focus:outline-none disabled:opacity-20 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1 light_sakura:border-rose-200 light_sakura:text-slate-600 light_sakura:hover:bg-rose-100"
                                title={t("admin.role_title")}
                              >
                                <Shield size={10} />
                                <span>{user.role === "admin" ? t("admin.demote") : t("admin.make_admin")}</span>
                              </button>

                              {/* Ban Toggle Trigger */}
                              <button
                                disabled={isSelf || user.role === "owner"}
                                onClick={() => handleToggleBan(user)}
                                className={`p-1.5 rounded-lg border transition-all focus:outline-none disabled:opacity-20 disabled:cursor-not-allowed cursor-pointer
                                  ${user.is_banned 
                                    ? "border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/10 light_sakura:border-emerald-200 light_sakura:text-emerald-600 light_sakura:hover:bg-emerald-50" 
                                    : "border-red-500/20 text-red-400 hover:bg-red-500/10 light_sakura:border-red-200 light_sakura:text-red-600 light_sakura:hover:bg-red-50"}`}
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
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-2 mt-4 font-sans text-xs text-slate-400">
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
                    className="px-3 py-1.5 rounded-lg border border-slate-800 bg-slate-900/60 hover:bg-slate-900 text-slate-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors light_sakura:border-rose-200 light_sakura:bg-white light_sakura:text-slate-700"
                  >
                    {t("admin.prev")}
                  </button>
                  <span className="px-3 py-1 bg-slate-950/40 rounded-md border border-slate-900 light_sakura:bg-rose-50/10">
                    {page + 1} / {Math.ceil(totalUsers / pageSize)}
                  </span>
                  <button
                    disabled={(page + 1) * pageSize >= totalUsers}
                    onClick={() => {
                      audioFeedback.playClick();
                      setPage(p => p + 1);
                    }}
                    className="px-3 py-1.5 rounded-lg border border-slate-800 bg-slate-900/60 hover:bg-slate-900 text-slate-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors light_sakura:border-rose-200 light_sakura:bg-white light_sakura:text-slate-700"
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
        </>
      )}

      {activeTab === "premium" && <AdminPremiumMonitor />}

      {activeTab === "voucher" && <AdminVoucherManager />}

      {activeTab === "categories" && <AdminCategoryManager />}

      {activeTab === "broadcast" && <AdminBroadcast />}

      {activeTab === "ai_monitor" && <AdminAiMonitor />}

      {activeTab === "error_monitor" && <AdminErrorMonitor />}

      {activeTab === "maintenance" && <AdminMaintenance />}

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
