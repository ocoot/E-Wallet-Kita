import React, { useState, useEffect, useCallback } from "react";
import { useLanguage } from "../contexts/LanguageContext";
import { useToast } from "../contexts/ToastContext";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../lib/supabase";
import { useAdmin } from "../hooks/useAdmin";
import { UserProfile } from "../types";
import { audioFeedback } from "../lib/audio";
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

export const AdminPanel: React.FC = () => {
  const { t, locale } = useLanguage();
  const { showToast } = useToast();
  const { user: currentUser } = useAuth();
  const { isAdmin, isOwner } = useAdmin();

  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [premiumFilter, setPremiumFilter] = useState<string>("all");
  const [banFilter, setBanFilter] = useState<string>("all");

  // Metrics state
  const [metrics, setMetrics] = useState({
    totalUsers: 0,
    premiumUsers: 0,
    adminUsers: 0,
    bannedUsers: 0,
  });

  // Pagination state
  const PAGE_SIZE = 20;
  const [page, setPage] = useState(0);
  const [totalUsers, setTotalUsers] = useState(0);

  // Reset page to 0 when filters change to avoid empty-result confusion
  useEffect(() => {
    setPage(0);
  }, [searchQuery, roleFilter, premiumFilter, banFilter]);

  // Load metrics
  const loadMetrics = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("users")
        .select("role, is_premium, is_banned");

      if (error) {
        console.error("Gagal memuat metrik:", error);
        return;
      }

      const list = data || [];
      setMetrics({
        totalUsers: list.length,
        premiumUsers: list.filter((u: any) => !!u.is_premium).length,
        adminUsers: list.filter((u: any) => u.role === "admin" || u.role === "owner").length,
        bannedUsers: list.filter((u: any) => !!u.is_banned).length,
      });
    } catch (err) {
      console.error("Metrik exception:", err);
    }
  }, []);

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

  // Fetch users with search, filters, and pagination purely built into Supabase
  const fetchUsers = useCallback(async () => {
    setLoading(true);
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

      query = query
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

      const { data, count, error } = await query;

      if (error) {
        throw error;
      }

      // Cast returned rows properly to UserProfile
      const typedUsers: UserProfile[] = (data || []).map((u: any) => ({
        id: u.id,
        email: u.email || "",
        display_name: u.display_name || "Guest User",
        is_premium: !!u.is_premium,
        is_banned: !!u.is_banned,
        role: (u.role as "owner" | "admin" | "user") || "user"
      }));

      setUsers(typedUsers);
      setTotalUsers(count || 0);
    } catch (err: any) {
      console.error("Gagal mendapatkan daftar pengguna:", err);
      showToast(locale === "id" ? "Gagal memuat daftar pengguna dari server." : "Failed to load user list from server.", "error");
    } finally {
      setLoading(false);
    }
  }, [locale, showToast, page, searchQuery, roleFilter, premiumFilter, banFilter]);

  useEffect(() => {
    if (isAdmin) {
      fetchUsers();
      loadMetrics();
    }
  }, [isAdmin, fetchUsers, loadMetrics, page, searchQuery, roleFilter, premiumFilter, banFilter]);

  // Handle premium changes
  const handleTogglePremium = async (targetUser: UserProfile) => {
    audioFeedback.playClick();
    if (targetUser.role === "owner") {
      showToast(
        locale === "id" 
          ? "Status premium Owner tidak dapat diubah!" 
          : "Owner premium status cannot be modified.", 
        "error"
      );
      return;
    }

    const nextPremium = !targetUser.is_premium;

    const actionText = nextPremium 
      ? (locale === "id" ? "aktifkan status" : "enable") 
      : (locale === "id" ? "nonaktifkan status" : "disable");

    setConfirmModal({
      isOpen: true,
      title: locale === "id" ? "Ubah Status Premium" : "Change Premium Status",
      description: locale === "id" 
        ? `Apakah Anda yakin ingin ${actionText} Premium Lifetime untuk ${targetUser.display_name}?`
        : `Are you sure you want to ${actionText} Premium Lifetime for ${targetUser.display_name}?`,
      type: "info",
      action: async () => {
        try {
          const { error } = await supabase
            .from("users")
            .update({ is_premium: nextPremium })
            .eq("id", targetUser.id);

          if (error) throw error;

          showToast(
            locale === "id" 
              ? `Status premium ${targetUser.display_name} berhasil diperbarui.`
              : `Premium status of ${targetUser.display_name} successfully updated.`,
            "success"
          );
          fetchUsers();
          loadMetrics();
        } catch (err: any) {
          console.error(err);
          showToast(err.message || "Failed to update", "error");
        }
      }
    });
  };

  // Handle ban / unban
  const handleToggleBan = async (targetUser: UserProfile) => {
    audioFeedback.playClick();
    if (targetUser.role === "owner") {
      showToast(
        locale === "id"
          ? "Owner tidak dapat dilarang!"
          : "Owner cannot be banned",
        "error"
      );
      return;
    }

    if (targetUser.id === currentUser?.id) {
      showToast(
        locale === "id" 
          ? "Anda tidak bisa memblokir (ban) akun Anda sendiri!"
          : "You cannot ban your own account!",
        "error"
      );
      return;
    }

    const nextBanned = !targetUser.is_banned;

    setConfirmModal({
      isOpen: true,
      title: nextBanned 
        ? (locale === "id" ? "Tangguhkan Pengguna" : "Suspend User")
        : (locale === "id" ? "Pulihkan Pengguna" : "Restore User"),
      description: locale === "id" 
        ? `Apakah Anda ingin ${nextBanned ? "menangguhkan" : "memulihkan kembali"} akses akun untuk ${targetUser.display_name}?`
        : `Are you sure you want to ${nextBanned ? "suspend" : "restore"} account access for ${targetUser.display_name}?`,
      type: nextBanned ? "danger" : "success",
      action: async () => {
        try {
          const { error } = await supabase
            .from("users")
            .update({ is_banned: nextBanned })
            .eq("id", targetUser.id);

          if (error) throw error;

          showToast(
            locale === "id" 
              ? `Akun ${targetUser.display_name} telah ${nextBanned ? "ditangguhkan" : "diaktifkan kembali"}.`
              : `Account ${targetUser.display_name} has been ${nextBanned ? "suspended" : "restored"}.`,
            "success"
          );
          fetchUsers();
          loadMetrics();
        } catch (err: any) {
          console.error(err);
          showToast(err.message || "Failed", "error");
        }
      }
    });
  };

  // Handle role promo / demote
  const handleToggleRole = async (targetUser: UserProfile) => {
    audioFeedback.playClick();
    if (targetUser.role === "owner") {
      showToast(
        locale === "id"
          ? "Peran Owner tidak dapat diubah!"
          : "Owner role cannot be changed",
        "error"
      );
      return;
    }

    if (targetUser.id === currentUser?.id) {
      showToast(
        locale === "id" 
          ? "Anda tidak dapat mengubah hak peran login Anda sendiri untuk mencegah ketidaksengajaan keluar!"
          : "You cannot change your own role to prevent accidental lockouts!",
        "error"
      );
      return;
    }

    const nextRole = targetUser.role === "admin" ? "user" : "admin";

    setConfirmModal({
      isOpen: true,
      title: locale === "id" ? "Ubah Peran Hak Akses" : "Adjust Role Privileges",
      description: locale === "id"
        ? `Apakah Anda ingin mengubah peran ${targetUser.display_name} menjadi ${nextRole.toUpperCase()}?`
        : `Are you sure you want to change ${targetUser.display_name}'s role to ${nextRole.toUpperCase()}?`,
      type: "warning",
      action: async () => {
        try {
          const { error } = await supabase
            .from("users")
            .update({ role: nextRole })
            .eq("id", targetUser.id);

          if (error) throw error;

          showToast(
            locale === "id" 
              ? `Peran ${targetUser.display_name} sekarang adalah ${nextRole.toUpperCase()}.`
              : `Role for ${targetUser.display_name} is now ${nextRole.toUpperCase()}.`,
            "success"
          );
          fetchUsers();
          loadMetrics();
        } catch (err: any) {
          console.error(err);
          showToast(err.message || "Failed", "error");
        }
      }
    });
  };

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6 bg-slate-950/20 rounded-3xl border border-red-500/10">
        <ShieldX size={48} className="text-red-500 mb-4 animate-bounce" />
        <h2 className="font-sans font-bold text-lg text-slate-100">
          {locale === "id" ? "Akses Ditolak" : "Access Denied"}
        </h2>
        <p className="font-sans text-xs text-slate-400 mt-2 max-w-md leading-relaxed">
          {locale === "id" 
            ? "Laman ini hanya dapat diakses oleh Administrator atau Pemilik utama. Silakan hubungi pengelola sistem bila ada kekeliruan."
            : "This page is strictly restricted to Administrators or Owners. Please contact systems support if you think this is a mistake."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      
      {/* Upper header section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/50 pb-6 light_sakura:border-rose-100/30">
        <div>
          <h1 className="font-sans font-black text-2xl tracking-tight text-white dark_obsidian:text-white light_sakura:text-slate-900 flex items-center gap-2">
            <Shield className="text-teal-400 light_sakura:text-rose-500" />
            <span>{locale === "id" ? t("nav.admin_panel") : "Admin Panel"}</span>
          </h1>
          <p className="font-sans text-xs text-slate-400 mt-1 light_sakura:text-slate-500">
            {locale === "id" 
              ? "Kelola hak istimewa pengguna, keanggotaan Premium Lifetime, dan status suspend secara seketika."
              : "Manage user roles, Lifetime Premium tier triggers, and suspension status instantly."
            }
          </p>
        </div>
        <button 
          onClick={() => {
            fetchUsers();
            loadMetrics();
          }}
          className="px-4 py-2 text-xs font-bold rounded-xl border border-slate-800 hover:bg-slate-900 transition-colors cursor-pointer text-slate-300 light_sakura:border-rose-200 light_sakura:text-slate-700 light_sakura:hover:bg-rose-100"
        >
          {locale === "id" ? "Segarkan Data" : "Refresh Data"}
        </button>
      </div>

      {/* Metrics Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4 shadow-sm light_sakura:bg-rose-100/10 light_sakura:border-rose-200">
          <p className="font-sans text-[10px] uppercase font-black tracking-wider text-slate-400 light_sakura:text-slate-600">
            Total Users
          </p>
          <h2 className="font-sans font-black text-2xl text-slate-100 light_sakura:text-slate-900 mt-1">
            {metrics.totalUsers}
          </h2>
        </div>

        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 shadow-sm">
          <p className="font-sans text-[10px] uppercase font-black tracking-wider text-amber-400/80">
            👑 Premium Users
          </p>
          <h2 className="font-sans font-black text-2xl text-amber-400 mt-1">
            {metrics.premiumUsers}
          </h2>
        </div>

        <div className="rounded-2xl border border-teal-500/20 bg-teal-500/5 p-4 shadow-sm">
          <p className="font-sans text-[10px] uppercase font-black tracking-wider text-teal-400/80">
            🛡️ Admins & Owners
          </p>
          <h2 className="font-sans font-black text-2xl text-teal-400 mt-1">
            {metrics.adminUsers}
          </h2>
        </div>

        <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-4 shadow-sm">
          <p className="font-sans text-[10px] uppercase font-black tracking-wider text-red-400/80">
            🚨 Suspended
          </p>
          <h2 className="font-sans font-black text-2xl text-red-450 mt-1">
            {metrics.bannedUsers}
          </h2>
        </div>
      </div>

      {/* Control panel (Search & filters) */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 rounded-2xl bg-slate-950/40 border border-slate-850/60 light_sakura:bg-rose-50/20 light_sakura:border-rose-100/50 shadow-sm shadow-black/10">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 light_sakura:text-rose-400" size={16} />
          <input
            type="text"
            placeholder={locale === "id" ? "Cari nama atau email..." : "Search name or email..."}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl font-sans text-xs bg-slate-900 border border-slate-800 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 light_sakura:bg-white light_sakura:border-rose-200 light_sakura:text-slate-800 light_sakura:placeholder-slate-400"
          />
        </div>
        
        <div>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="w-full px-4 py-2.5 rounded-xl font-sans text-xs bg-slate-900 border border-slate-800 text-slate-300 focus:outline-none focus:border-indigo-500 cursor-pointer light_sakura:bg-white light_sakura:border-rose-200 light_sakura:text-slate-700"
          >
            <option value="all">Role: All</option>
            <option value="owner">Role: Owner</option>
            <option value="admin">Role: Admin</option>
            <option value="user">Role: User</option>
          </select>
        </div>

        <div>
          <select
            value={premiumFilter}
            onChange={(e) => setPremiumFilter(e.target.value)}
            className="w-full px-4 py-2.5 rounded-xl font-sans text-xs bg-slate-900 border border-slate-800 text-slate-300 focus:outline-none focus:border-indigo-500 cursor-pointer light_sakura:bg-white light_sakura:border-rose-200 light_sakura:text-slate-700"
          >
            <option value="all">Premium: All</option>
            <option value="premium">Premium: Active</option>
            <option value="normal">Premium: Lite</option>
          </select>
        </div>

        <div>
          <select
            value={banFilter}
            onChange={(e) => setBanFilter(e.target.value)}
            className="w-full px-4 py-2.5 rounded-xl font-sans text-xs bg-slate-900 border border-slate-800 text-slate-300 focus:outline-none focus:border-indigo-500 cursor-pointer light_sakura:bg-white light_sakura:border-rose-200 light_sakura:text-slate-700"
          >
            <option value="all">Status: All</option>
            <option value="normal">Status: Active</option>
            <option value="banned">Status: Suspended (Banned)</option>
          </select>
        </div>
      </div>

      {/* Main user list / table */}
      <div className="overflow-hidden rounded-2xl border border-slate-850/60 bg-slate-950/40 light_sakura:bg-rose-50/10 light_sakura:border-rose-100/50 shadow-md">
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center space-y-3">
            <Clock className="animate-spin text-teal-400 light_sakura:text-rose-500" size={32} />
            <p className="font-sans text-xs text-slate-400">
              {locale === "id" ? "Memuat data pengguna..." : "Loading user details..."}
            </p>
          </div>
        ) : users.length === 0 ? (
          <div className="py-20 flex flex-col items-center justify-center text-center p-6">
            <User className="text-slate-600 mb-3" size={36} />
            <p className="font-sans text-sm font-bold text-slate-300">
              {locale === "id" ? "Tidak Ada Pengguna" : "No Users Found"}
            </p>
            <p className="font-sans text-xs text-slate-500 mt-1">
              {locale === "id" ? "Coba ganti kata kunci atau penyaring filter Anda." : "Try adjusting your search criteria or filters."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse table-auto">
              <thead>
                <tr className="border-b border-slate-850/60 bg-slate-900/60 text-[10px] font-bold text-slate-400 uppercase tracking-wider light_sakura:bg-rose-100/30 light_sakura:border-rose-100/40 light_sakura:text-slate-600">
                  <th className="px-6 py-4">{locale === "id" ? "Pengguna" : "User"}</th>
                  <th className="px-6 py-4">{locale === "id" ? "Email" : "Email"}</th>
                  <th className="px-6 py-4">{locale === "id" ? "Keanggotaan" : "Membership"}</th>
                  <th className="px-6 py-4">{locale === "id" ? "Peran" : "Role"}</th>
                  <th className="px-6 py-4">{locale === "id" ? "Status Akses" : "Access State"}</th>
                  <th className="px-6 py-4 text-right">{locale === "id" ? "Aksi Tindakan" : "Actions"}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-850/50 light_sakura:divide-rose-100/20">
                {users.map((user) => {
                  const isSelf = user.id === currentUser?.id;
                  return (
                    <tr 
                      key={user.id} 
                      className={`hover:bg-slate-900/20 transition-all duration-150 ${user.is_banned ? "bg-red-950/5" : ""} light_sakura:hover:bg-rose-100/10`}
                    >
                      {/* Name Card */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-xl font-bold flex items-center justify-center shrink-0 
                            ${user.is_banned ? "bg-red-500/20 text-red-400" : "bg-slate-900 text-teal-400 light_sakura:bg-rose-200 light_sakura:text-rose-600"}`}>
                            {user.display_name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <span className="font-sans font-bold text-xs text-slate-200 light_sakura:text-slate-800 block">
                              {user.display_name} {isSelf && " (You)"}
                            </span>
                            <span className="font-mono text-[9px] text-slate-500 block">
                              ID: {user.id.slice(0, 8)}...
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Email */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 font-sans text-xs text-slate-400 light_sakura:text-slate-600">
                          <Mail size={12} className="text-slate-500 shrink-0" />
                          <span>{user.email || "No email"}</span>
                        </div>
                      </td>

                      {/* Premium Toggle Column */}
                      <td className="px-6 py-4">
                        <button
                          disabled={user.role === "owner"}
                          onClick={() => handleTogglePremium(user)}
                          className="focus:outline-none text-left cursor-pointer transition-transform active:scale-95 block disabled:opacity-50 disabled:cursor-not-allowed"
                          title={locale === "id" ? "Klik untuk ubah Premium" : "Toggle Premium Status"}
                        >
                          {user.is_premium ? (
                            <span className="px-2 py-1 text-[9px] font-extrabold tracking-wider bg-amber-500/15 text-amber-400 border border-amber-500/30 rounded-lg flex items-center gap-1 inline-flex hover:bg-amber-500/25">
                              👑 PREMIUM
                            </span>
                          ) : (
                            <span className="px-2 py-1 text-[9px] font-extrabold tracking-wider bg-slate-800 text-slate-400 border border-slate-800/80 rounded-lg hover:bg-slate-700/50 inline-flex">
                              LITE
                            </span>
                          )}
                        </button>
                      </td>

                      {/* Role column */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-1 text-[9px] font-extrabold tracking-wider rounded-lg uppercase
                            ${user.role === "owner" ? "bg-red-500/10 text-red-400 border border-red-500/20" :
                              user.role === "admin" ? "bg-teal-500/10 text-teal-400 border border-teal-500/20" : 
                              "bg-slate-800 text-slate-400"}`}>
                            {user.role}
                          </span>
                        </div>
                      </td>

                      {/* Suspend Status */}
                      <td className="px-6 py-4">
                        {user.is_banned ? (
                          <span className="px-2 py-1 text-[9px] font-extrabold tracking-wider bg-red-500/15 text-red-500 border border-red-500/35 rounded-lg flex items-center gap-1 inline-flex">
                            <XCircle size={10} />
                            BANNED
                          </span>
                        ) : (
                          <span className="px-2 py-1 text-[9px] font-extrabold tracking-wider bg-emerald-500/15 text-emerald-400 border border-emerald-500/35 rounded-lg flex items-center gap-1 inline-flex">
                            <CheckCircle size={10} />
                            ACTIVE
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Role Toggle Trigger */}
                          <button
                            disabled={isSelf || user.role === "owner"}
                            onClick={() => handleToggleRole(user)}
                            className="p-1 px-2.5 text-[10px] font-bold text-slate-400 border border-slate-800 hover:text-white hover:border-slate-700 rounded-lg transition-all focus:outline-none disabled:opacity-20 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1 light_sakura:border-rose-200"
                            title={locale === "id" ? "Ubah Peran (Admin/User)" : "Toggle Role (Admin/User)"}
                          >
                            <Shield size={10} />
                            <span>{user.role === "admin" ? "Demote" : "Make Admin"}</span>
                          </button>

                          {/* Ban Toggle Trigger */}
                          <button
                            disabled={isSelf || user.role === "owner"}
                            onClick={() => handleToggleBan(user)}
                            className={`p-1.5 rounded-lg border transition-all focus:outline-none disabled:opacity-20 disabled:cursor-not-allowed cursor-pointer
                              ${user.is_banned 
                                ? "border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/10" 
                                : "border-red-500/20 text-red-400 hover:bg-red-500/10"}`}
                            title={user.is_banned ? (locale === "id" ? "Buka Blokir" : "Unban") : (locale === "id" ? "Blokir Akun" : "Ban Account")}
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
          </div>
        )}
      </div>

      {/* Pagination controls */}
      {totalUsers > PAGE_SIZE && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-2 mt-4 font-sans text-xs text-slate-400">
          <div>
            {locale === "id" 
              ? `Menampilkan ${page * PAGE_SIZE + 1} - ${Math.min((page + 1) * PAGE_SIZE, totalUsers)} dari ${totalUsers} pengguna`
              : `Showing ${page * PAGE_SIZE + 1} - ${Math.min((page + 1) * PAGE_SIZE, totalUsers)} of ${totalUsers} users`
            }
          </div>
          <div className="flex items-center gap-2">
            <button
              disabled={page === 0}
              onClick={() => {
                audioFeedback.playClick();
                setPage(p => Math.max(0, p - 1));
              }}
              className="px-3 py-1.5 rounded-lg border border-slate-850 bg-slate-900/60 hover:bg-slate-900 text-slate-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors light_sakura:border-rose-200 light_sakura:bg-white light_sakura:text-slate-700"
            >
              {locale === "id" ? "Sebelumnya" : "Previous"}
            </button>
            <span className="px-3 py-1 bg-slate-950/40 rounded-md border border-slate-900 light_sakura:bg-rose-50/10">
              {page + 1} / {Math.ceil(totalUsers / PAGE_SIZE)}
            </span>
            <button
              disabled={(page + 1) * PAGE_SIZE >= totalUsers}
              onClick={() => {
                audioFeedback.playClick();
                setPage(p => p + 1);
              }}
              className="px-3 py-1.5 rounded-lg border border-slate-850 bg-slate-900/60 hover:bg-slate-900 text-slate-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors light_sakura:border-rose-200 light_sakura:bg-white light_sakura:text-slate-700"
            >
              {locale === "id" ? "Selanjutnya" : "Next"}
            </button>
          </div>
        </div>
      )}

      {/* Confirmation helper Modal */}
      <Modal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        description={confirmModal.description}
        type={confirmModal.type}
        confirmLabel={locale === "id" ? "Lanjutkan" : "Proceed"}
        cancelLabel={locale === "id" ? "Batal" : "Cancel"}
        onConfirm={async () => {
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
          await confirmModal.action();
        }}
        onCancel={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
      />

    </div>
  );
};
