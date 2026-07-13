import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Helper maintenance mode untuk dipakai di sisi backend (bot Telegram).
 * Modul ini BUKAN endpoint API baru — hanya fungsi yang di-import langsung
 * oleh api/telegram-webhook.ts, sehingga tidak menambah jumlah file di
 * direktori api/* (yang dibatasi oleh limit Vercel).
 *
 * Sumber kebenaran status maintenance & fitur yang terkunci tetap satu:
 * RPC `get_maintenance_status` di Supabase (tabel maintenance_settings &
 * maintenance_feature_locks), yang juga dipakai oleh frontend web. Dengan
 * begitu admin hanya perlu mengubah satu tempat (tab Maintenance di Admin
 * Panel) agar berlaku konsisten di web maupun di bot.
 */

export type MaintenanceLang = 'id' | 'en';

export interface MaintenanceFeatureLock {
  feature_key: string;
  is_locked: boolean;
}

export interface MaintenanceStatus {
  is_active: boolean;
  message_id: string;
  message_en: string;
  locked_features: MaintenanceFeatureLock[];
}

const FALLBACK_STATUS: MaintenanceStatus = {
  is_active: false,
  message_id: '',
  message_en: '',
  locked_features: [],
};

/**
 * Ambil status maintenance terbaru dari Supabase.
 * Jika RPC gagal (misalnya koneksi bermasalah), fail-open: anggap
 * maintenance tidak aktif agar bot tetap bisa dipakai user secara normal,
 * daripada memblokir seluruh fitur akibat error yang tidak terduga.
 */
export async function getMaintenanceStatus(
  supabase: SupabaseClient
): Promise<MaintenanceStatus> {
  try {
    const { data, error } = await supabase.rpc('get_maintenance_status');
    if (error || !data) {
      console.error('Gagal memuat status maintenance:', error?.message);
      return FALLBACK_STATUS;
    }
    return {
      is_active: !!data.is_active,
      message_id: data.message_id || '',
      message_en: data.message_en || '',
      locked_features: Array.isArray(data.locked_features) ? data.locked_features : [],
    };
  } catch (err) {
    console.error('Exception saat memuat status maintenance:', err);
    return FALLBACK_STATUS;
  }
}

/**
 * Cek apakah sebuah fitur (berdasarkan feature_key di DB) sedang terkunci.
 * Mengikuti aturan yang sama dengan frontend: fitur dianggap terkunci hanya
 * jika maintenance global AKTIF dan fitur tersebut secara spesifik dikunci.
 */
export function isFeatureLocked(status: MaintenanceStatus, featureKey: string): boolean {
  if (!status.is_active) return false;
  return status.locked_features.some(f => f.feature_key === featureKey && f.is_locked);
}

/**
 * Ambil pesan maintenance sesuai bahasa pengguna bot. Pesan ini sepenuhnya
 * berasal dari data yang diatur admin lewat tab Maintenance — tidak ada
 * teks pesan yang ditulis langsung (hardcode) di kode bot.
 */
export function getMaintenanceMessage(status: MaintenanceStatus, lang: MaintenanceLang): string {
  return lang === 'en' ? status.message_en : status.message_id;
}
