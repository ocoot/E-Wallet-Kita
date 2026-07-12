import { supabase } from "./supabase";

/** Kontrol upload foto profil (self-service). Lihat migration
 * `20260808000000_user_avatar_upload.sql` untuk bucket & RLS-nya. */

const MAX_FILE_SIZE_BYTES = 3 * 1024 * 1024; // 3 MB
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];

export class AvatarValidationError extends Error {
  code: "INVALID_TYPE" | "TOO_LARGE";
  constructor(code: "INVALID_TYPE" | "TOO_LARGE", message: string) {
    super(message);
    this.code = code;
  }
}

function extractExtension(file: File): string {
  const byMime: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  };
  return byMime[file.type] || "jpg";
}

/**
 * Validasi + upload foto profil ke Supabase Storage bucket "avatars"
 * (path: `<user_id>/avatar.<ext>`, selalu di-overwrite/upsert supaya
 * "tap to change" cukup upload ulang tanpa perlu hapus file lama dulu),
 * lalu simpan URL publiknya ke kolom `users.avatar_url`.
 *
 * Mengembalikan URL publik (dengan cache-busting query param) yang siap
 * dipakai langsung di <img src>.
 */
export async function uploadAvatar(userId: string, file: File): Promise<string> {
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    throw new AvatarValidationError("INVALID_TYPE", "AVATAR_INVALID_TYPE");
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new AvatarValidationError("TOO_LARGE", "AVATAR_TOO_LARGE");
  }

  const ext = extractExtension(file);
  const path = `${userId}/avatar.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("avatars")
    .upload(path, file, {
      cacheControl: "3600",
      upsert: true,
      contentType: file.type,
    });

  if (uploadError) throw uploadError;

  const { data: publicUrlData } = supabase.storage.from("avatars").getPublicUrl(path);
  // Cache-bust supaya <img> langsung refresh walau nama file sama persis
  // dengan sebelumnya (upsert tidak mengubah nama file).
  const avatarUrl = `${publicUrlData.publicUrl}?v=${Date.now()}`;

  const { error: dbError } = await supabase
    .from("users")
    .update({ avatar_url: avatarUrl })
    .eq("id", userId);

  if (dbError) throw dbError;

  return avatarUrl;
}
