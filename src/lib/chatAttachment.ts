import { supabase } from "./supabase";

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif"];

export class AttachmentValidationError extends Error {
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
    "image/gif": "gif",
    "image/heic": "heic",
    "image/heif": "heif",
  };
  return byMime[file.type] || "jpg";
}

export async function uploadChatAttachment(userId: string, sessionId: string, file: File): Promise<string> {
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    throw new AttachmentValidationError("INVALID_TYPE", "CHAT_ATTACHMENT_INVALID_TYPE");
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new AttachmentValidationError("TOO_LARGE", "CHAT_ATTACHMENT_TOO_LARGE");
  }

  const ext = extractExtension(file);
  const path = `${userId}/${sessionId}/${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("chat-attachments")
    .upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type,
    });

  if (uploadError) throw uploadError;

  const { data: publicUrlData } = supabase.storage.from("chat-attachments").getPublicUrl(path);
  return `${publicUrlData.publicUrl}?v=${Date.now()}`;
}
