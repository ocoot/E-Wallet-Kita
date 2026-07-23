/**
 * App Lock -- kunci layar tambahan (PIN 6 digit dan/atau Face ID/Touch ID)
 * di ATAS sesi Supabase yang sudah login, mirip pola Gopay/OVO/Dana yang
 * meminta PIN/biometric setiap kali app dibuka atau kembali dari background.
 *
 * PENTING (batasan desain, disengaja): ini adalah "device-level convenience
 * lock", BUKAN pengganti autentikasi server. PIN disimpan sebagai hash
 * (SHA-256 + salt acak) di localStorage milik perangkat itu sendiri --
 * tidak pernah dikirim ke server. Face ID/Touch ID memakai WebAuthn
 * (`navigator.credentials`) hanya untuk memverifikasi "apakah pemilik
 * perangkat ini bisa lewat sensor platform yang sama saat setup", TANPA
 * verifikasi signature di backend (yang butuh tabel credential publik +
 * endpoint verifikasi tersendiri) -- cukup untuk mencegah orang lain yang
 * mengambil HP dalam keadaan ter-login membuka app, tapi TIDAK menggantikan
 * peran signInWithPassword/Google di Login.tsx sebagai identitas asli.
 *
 * Data disimpan per-user (dikunci oleh `userId`) supaya:
 * 1. Ganti akun di perangkat yang sama tidak mewarisi PIN akun lain.
 * 2. Logout tidak otomatis menghapus setup PIN (biar tidak perlu setup
 *    ulang tiap re-login), tapi TETAP tidak bisa dipakai membuka data user
 *    lain karena keynya sudah beda.
 */

const STORAGE_PREFIX = "ewk_applock:";
const LOCK_TIMEOUT_MS = 60_000; // App di-background >60 detik -> re-lock saat kembali.

export interface AppLockState {
  enabled: boolean;
  pinHash: string | null;
  pinSalt: string | null;
  biometricEnabled: boolean;
  biometricCredentialId: string | null;
}

const DEFAULT_STATE: AppLockState = {
  enabled: false,
  pinHash: null,
  pinSalt: null,
  biometricEnabled: false,
  biometricCredentialId: null,
};

function storageKey(userId: string): string {
  return `${STORAGE_PREFIX}${userId}`;
}

export function getAppLockState(userId: string | null | undefined): AppLockState {
  if (!userId || typeof window === "undefined") return { ...DEFAULT_STATE };
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) return { ...DEFAULT_STATE };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_STATE, ...parsed };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

function saveAppLockState(userId: string, state: AppLockState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(state));
  } catch {
    // localStorage penuh/diblokir (mis. mode private ketat) -- gagal diam,
    // fitur App Lock cukup jadi no-op ketimbang melempar error ke UI.
  }
}

function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function randomSaltHex(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return bufferToHex(bytes.buffer);
}

async function hashPin(pin: string, salt: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(`${salt}:${pin}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return bufferToHex(digest);
}

/** Validasi format dasar: harus persis 6 digit angka. */
export function isValidPinFormat(pin: string): boolean {
  return /^\d{6}$/.test(pin);
}

/** Simpan PIN baru (dipakai saat setup awal maupun ganti PIN). */
export async function setPin(userId: string, pin: string): Promise<void> {
  const salt = randomSaltHex();
  const pinHash = await hashPin(pin, salt);
  const current = getAppLockState(userId);
  saveAppLockState(userId, { ...current, pinHash, pinSalt: salt });
}

/** Cocokkan PIN yang diketik user terhadap hash tersimpan. */
export async function verifyPin(userId: string, pin: string): Promise<boolean> {
  const state = getAppLockState(userId);
  if (!state.pinHash || !state.pinSalt) return false;
  const attemptHash = await hashPin(pin, state.pinSalt);
  return attemptHash === state.pinHash;
}

export function hasPinConfigured(userId: string | null | undefined): boolean {
  const state = getAppLockState(userId);
  return !!state.pinHash;
}

export function setAppLockEnabled(userId: string, enabled: boolean): void {
  const current = getAppLockState(userId);
  saveAppLockState(userId, { ...current, enabled });
}

export function isAppLockEnabled(userId: string | null | undefined): boolean {
  return getAppLockState(userId).enabled;
}

/**
 * Menghapus SELURUH setup App Lock (PIN + biometric + status aktif) untuk
 * user ini. Dipakai pada alur "Lupa PIN / Reset" -- caller (AppLockScreen /
 * AppLockSettings) bertanggung jawab memastikan ini hanya bisa dipicu
 * setelah user membuktikan identitasnya lagi (mis. re-login dengan
 * password), supaya orang yang sekadar memegang HP ter-login tidak bisa
 * begitu saja mematikan kunci layar.
 */
export function resetAppLock(userId: string): void {
  saveAppLockState(userId, { ...DEFAULT_STATE });
}

// ── Biometric (Face ID / Touch ID via WebAuthn platform authenticator) ──

export async function isBiometricSupported(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (!window.PublicKeyCredential) return false;
  try {
    const anyPKC = PublicKeyCredential as unknown as {
      isUserVerifyingPlatformAuthenticatorAvailable?: () => Promise<boolean>;
    };
    if (typeof anyPKC.isUserVerifyingPlatformAuthenticatorAvailable !== "function") return false;
    return await anyPKC.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

function randomChallenge(): Uint8Array {
  const challenge = new Uint8Array(32);
  crypto.getRandomValues(challenge);
  return challenge;
}

function base64FromBuffer(buffer: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return window.btoa(binary);
}

function bufferFromBase64(base64: string): ArrayBuffer {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

/**
 * Daftarkan Face ID/Touch ID (atau sensor platform lain) untuk user ini.
 * Mengembalikan `false` (bukan melempar) kalau user membatalkan prompt
 * sensor -- itu bukan error, cukup berarti "batal setup".
 */
export async function registerBiometric(userId: string, displayName: string): Promise<boolean> {
  try {
    const credential = (await navigator.credentials.create({
      publicKey: {
        challenge: randomChallenge(),
        rp: { name: "E-Wallet Kita" },
        user: {
          id: new TextEncoder().encode(userId),
          name: displayName || "user",
          displayName: displayName || "User",
        },
        pubKeyCredParams: [
          { type: "public-key", alg: -7 }, // ES256
          { type: "public-key", alg: -257 }, // RS256
        ],
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          userVerification: "required",
          residentKey: "preferred",
        },
        timeout: 60_000,
        attestation: "none",
      },
    })) as PublicKeyCredential | null;

    if (!credential) return false;

    const credentialId = base64FromBuffer(credential.rawId);
    const current = getAppLockState(userId);
    saveAppLockState(userId, {
      ...current,
      biometricEnabled: true,
      biometricCredentialId: credentialId,
    });
    return true;
  } catch {
    // NotAllowedError (dibatalkan/timeout) atau sensor tidak tersedia --
    // gagal-diam, biar caller cukup menampilkan "setup dibatalkan".
    return false;
  }
}

export function hasBiometricConfigured(userId: string | null | undefined): boolean {
  const state = getAppLockState(userId);
  return state.biometricEnabled && !!state.biometricCredentialId;
}

/** Minta user memverifikasi lewat sensor platform yang sudah didaftarkan. */
export async function verifyBiometric(userId: string): Promise<boolean> {
  const state = getAppLockState(userId);
  if (!state.biometricCredentialId) return false;

  try {
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: randomChallenge(),
        allowCredentials: [
          { id: bufferFromBase64(state.biometricCredentialId), type: "public-key" },
        ],
        userVerification: "required",
        timeout: 60_000,
      },
    });
    return !!assertion;
  } catch {
    return false;
  }
}

export function disableBiometric(userId: string): void {
  const current = getAppLockState(userId);
  saveAppLockState(userId, { ...current, biometricEnabled: false, biometricCredentialId: null });
}

export const APP_LOCK_TIMEOUT_MS = LOCK_TIMEOUT_MS;
