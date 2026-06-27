// Hook ini sekarang hanya re-export tipis ke AdminContext.
//
// Sebelumnya, setiap komponen yang memanggil useAdmin() (App.tsx,
// AdminPanel.tsx, AdminMaintenance.tsx, dll) punya state isAdmin/isOwner-nya
// SENDIRI-SENDIRI dan masing-masing melakukan fetch role ke DB secara
// independen. Ini menyebabkan:
//   1. Query duplikat ke DB setiap ada perubahan auth state.
//   2. Race condition: salah satu instance bisa gagal fetch (network blip,
//      transisi token refresh, dst) sementara yang lain berhasil, sehingga
//      isAdmin di route guard (App.tsx) bisa sempat jadi `false` walau
//      role user sebenarnya tidak berubah -> route /admin auto-redirect ke
//      /dashboard -> terasa seperti "reload tiba-tiba" di Admin Panel.
//
// Sekarang semua komponen membaca dari SATU sumber state yang sama
// (AdminProvider), jadi tidak ada lagi duplikasi fetch maupun race
// condition antar komponen.
import { useAdminContext } from "../contexts/AdminContext";

export function useAdmin() {
  return useAdminContext();
}
