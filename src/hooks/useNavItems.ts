import {
  Wallet,
  LayoutDashboard,
  PlusCircle,
  History as HistoryIcon,
  Settings as SettingsIcon,
  Shield,
  PiggyBank,
  Bell,
  Landmark,
  Vault,
  Coins,
} from "lucide-react";
import { useLanguage } from "../contexts/LanguageContext";
import { useAdmin } from "./useAdmin";

export interface NavItem {
  id: string;
  label: string;
  icon: any;
  path: string;
  featureKey?: string;
}

/**
 * Sumber tunggal daftar menu navigasi aplikasi. Dulu daftar ini didefinisikan
 * langsung di dalam `Sidebar.tsx`, tapi sekarang dipakai juga oleh
 * `MobileBottomNav.tsx` (navbar bawah untuk tampilan handphone), jadi
 * ditarik keluar ke satu hook supaya kedua tempat itu tidak bisa saling
 * "kelupaan disinkronkan" saat ada menu baru ditambahkan/diubah.
 */
export function useNavItems(): NavItem[] {
  const { t } = useLanguage();
  const { isAdmin } = useAdmin();

  const menuItems: NavItem[] = [
    { id: "dashboard", label: t("nav.dashboard"), icon: LayoutDashboard, path: "/dashboard" },
    { id: "new_transaction", label: t("nav.new_transaction"), icon: PlusCircle, path: "/transactions/new", featureKey: "new_transaction" },
    { id: "wallets", label: t("nav.wallets"), icon: Wallet, path: "/wallets", featureKey: "wallets" },
    { id: "budget", label: t("nav.budget"), icon: PiggyBank, path: "/budget", featureKey: "budget" },
    { id: "bill_reminders", label: t("nav.bill_reminders"), icon: Bell, path: "/bill-reminders", featureKey: "bill_reminders" },
    { id: "installments", label: t("nav.installments"), icon: Landmark, path: "/installments", featureKey: "installments" },
    { id: "savings", label: t("nav.savings"), icon: Vault, path: "/savings", featureKey: "savings" },
    { id: "gold_savings", label: t("nav.gold_savings"), icon: Coins, path: "/gold-savings", featureKey: "gold_savings" },
    { id: "history", label: t("nav.history"), icon: HistoryIcon, path: "/transactions", featureKey: "history" },
    { id: "settings", label: t("nav.settings"), icon: SettingsIcon, path: "/settings", featureKey: "settings" },
  ];

  if (isAdmin) {
    menuItems.push({ id: "admin", label: t("nav.admin_panel"), icon: Shield, path: "/admin" });
  }

  return menuItems;
}

/**
 * ID item yang tampil sebagai ikon utama di navbar bawah (mobile).
 * Urutan array ini menentukan urutan tampil di navbar.
 */
export const MOBILE_PRIMARY_NAV_IDS = ["dashboard", "wallets", "new_transaction", "history"] as const;
