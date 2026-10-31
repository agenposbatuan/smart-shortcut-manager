// Layanan Keamanan Master PIN & Kata Kunci Pemulihan (Recovery Keyword)
// Menggunakan Web Crypto API PBKDF2 (100.000 iterasi SHA-256) dengan Salt Unik
// Sinkronisasi: Cloud Firestore (koleksi 'app_settings', dokumen 'master_pin_config') & LocalStorage

import { db } from './firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const SETTINGS_COLLECTION = 'app_settings';
const SECURITY_DOC_ID = 'master_pin_config';

const LOCAL_SESSION_KEY = 'sevenproject_masterpin_session_v1';
const LOCAL_CONFIG_CACHE_KEY = 'sevenproject_masterpin_cache_v1';
const LOCAL_RATE_LIMIT_KEY = 'sevenproject_masterpin_ratelimit_v1';

// Salt unik statis untuk pengamanan PBKDF2 derivasi hash
const MASTER_PIN_SALT = 'sevenproject_masterpin_salt_v1_secure_2026_';
const RECOVERY_KEYWORD_SALT = 'sevenproject_recoverykey_salt_v1_secure_2026_';

// Ambang batas percobaan gagal sebelum lockout (5 kali percobaan -> cooldown 30 detik)
const MAX_FAILED_ATTEMPTS = 5;
const COOLDOWN_SECONDS = 30;

export interface MasterPinConfig {
  isConfigured: boolean;
  pinHash: string; // PBKDF2 derived hex
  keywordHash: string; // PBKDF2 derived hex
  updatedAt: number;
  version: number;
}

interface RateLimitData {
  failedAttempts: number;
  lockoutUntil: number;
}

let inMemoryConfig: MasterPinConfig | null = null;

/**
 * Derivasi hash kriptografis yang sangat kuat menggunakan PBKDF2 dengan 100.000 iterasi SHA-256
 */
async function derivePBKDF2Hash(secret: string, saltPrefix: string): Promise<string> {
  const enc = new TextEncoder();
  const normalizedSecret = secret.trim();
  
  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    enc.encode(normalizedSecret),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );

  const saltBuffer = enc.encode(saltPrefix);

  const derivedBits = await window.crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBuffer,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );

  const hashArray = Array.from(new Uint8Array(derivedBits));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Mengambil data status rate limit (cooldown) saat ini
 */
function getRateLimitData(): RateLimitData {
  try {
    const raw = localStorage.getItem(LOCAL_RATE_LIMIT_KEY);
    if (!raw) return { failedAttempts: 0, lockoutUntil: 0 };
    const parsed = JSON.parse(raw);
    return {
      failedAttempts: typeof parsed.failedAttempts === 'number' ? parsed.failedAttempts : 0,
      lockoutUntil: typeof parsed.lockoutUntil === 'number' ? parsed.lockoutUntil : 0,
    };
  } catch {
    return { failedAttempts: 0, lockoutUntil: 0 };
  }
}

/**
 * Menyimpan data status rate limit
 */
function saveRateLimitData(data: RateLimitData): void {
  try {
    localStorage.setItem(LOCAL_RATE_LIMIT_KEY, JSON.stringify(data));
  } catch {}
}

/**
 * Mengambil sisa waktu jeda (cooldown) dalam detik jika terkunci
 */
export function getCooldownRemaining(): number {
  const { lockoutUntil } = getRateLimitData();
  const now = Date.now();
  if (lockoutUntil > now) {
    return Math.ceil((lockoutUntil - now) / 1000);
  }
  return 0;
}

/**
 * Mencatat percobaan gagal dan mengaktifkan cooldown jika mencapai ambang batas
 */
function recordFailedAttempt(): { lockoutSeconds: number; attemptsLeft: number } {
  const current = getRateLimitData();
  const newAttempts = current.failedAttempts + 1;
  let lockoutUntil = current.lockoutUntil;

  if (newAttempts >= MAX_FAILED_ATTEMPTS) {
    lockoutUntil = Date.now() + (COOLDOWN_SECONDS * 1000);
  }

  saveRateLimitData({
    failedAttempts: newAttempts,
    lockoutUntil,
  });

  const remaining = lockoutUntil > Date.now() ? Math.ceil((lockoutUntil - Date.now()) / 1000) : 0;
  const attemptsLeft = Math.max(0, MAX_FAILED_ATTEMPTS - newAttempts);
  return { lockoutSeconds: remaining, attemptsLeft };
}

/**
 * Reset rate limit setelah verifikasi berhasil
 */
function resetRateLimit(): void {
  try {
    localStorage.removeItem(LOCAL_RATE_LIMIT_KEY);
  } catch {}
}

/**
 * Membaca konfigurasi dari cache lokal / memori
 */
function getLocalConfigCache(): MasterPinConfig | null {
  if (inMemoryConfig) return inMemoryConfig;
  try {
    const raw = localStorage.getItem(LOCAL_CONFIG_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.isConfigured === 'boolean') {
        inMemoryConfig = parsed;
        return parsed;
      }
    }
  } catch {}
  return null;
}

/**
 * Menyimpan konfigurasi ke cache lokal & memori
 */
function saveLocalConfigCache(config: MasterPinConfig): void {
  inMemoryConfig = config;
  try {
    localStorage.setItem(LOCAL_CONFIG_CACHE_KEY, JSON.stringify(config));
  } catch {}
}

/**
 * Sinkronisasi konfigurasi keamanan dari Firestore ke LocalStorage & Memori
 */
export async function syncPinConfig(): Promise<MasterPinConfig> {
  try {
    const docRef = doc(db, SETTINGS_COLLECTION, SECURITY_DOC_ID);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      const data = docSnap.data();
      const firestoreConfig: MasterPinConfig = {
        isConfigured: data.isConfigured === true && typeof data.pinHash === 'string' && data.pinHash.length === 64,
        pinHash: typeof data.pinHash === 'string' ? data.pinHash : '',
        keywordHash: typeof data.keywordHash === 'string' ? data.keywordHash : '',
        updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : Date.now(),
        version: typeof data.version === 'number' ? data.version : 1,
      };

      saveLocalConfigCache(firestoreConfig);
      return firestoreConfig;
    } else {
      // Jika dokumen Firestore belum ada, periksa cache lokal
      const local = getLocalConfigCache();
      if (local && local.isConfigured) {
        // Upload cache lokal ke Firestore
        try {
          await setDoc(docRef, local, { merge: true });
        } catch (e) {
          console.warn('Could not sync initial local config to Firestore:', e);
        }
        return local;
      }

      const emptyConfig: MasterPinConfig = {
        isConfigured: false,
        pinHash: '',
        keywordHash: '',
        updatedAt: Date.now(),
        version: 1,
      };
      saveLocalConfigCache(emptyConfig);
      return emptyConfig;
    }
  } catch (err) {
    console.warn('Network issue fetching pin config, using local cache:', err);
    const local = getLocalConfigCache();
    if (local) return local;

    const fallback: MasterPinConfig = {
      isConfigured: false,
      pinHash: '',
      keywordHash: '',
      updatedAt: Date.now(),
      version: 1,
    };
    return fallback;
  }
}

/**
 * Memeriksa apakah Master PIN sudah pernah dibuat (synchronous via cache)
 */
export function isPinConfiguredSync(): boolean {
  const config = getLocalConfigCache();
  return !!(config && config.isConfigured && config.pinHash);
}

/**
 * Memeriksa apakah sesi unlock Master PIN sedang aktif
 */
export function isPinSessionActive(): boolean {
  try {
    const raw = localStorage.getItem(LOCAL_SESSION_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.token || typeof parsed.expires !== 'number') {
      return false;
    }
    if (Date.now() > parsed.expires) {
      localStorage.removeItem(LOCAL_SESSION_KEY);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Mengaktifkan sesi unlock
 */
function activateSession(): void {
  try {
    const payload = {
      token: (typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : Math.random().toString(36).substring(2)) + '_' + Date.now(),
      expires: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 hari
    };
    localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(payload));
  } catch {}
}

/**
 * Mengunci aplikasi / mengakhiri sesi aktif
 */
export function logoutPinSession(): void {
  try {
    localStorage.removeItem(LOCAL_SESSION_KEY);
  } catch {}
}

/**
 * 1. PENGATURAN KATA KUNCI PEMULIHAN & MASTER PIN PERTAMA KALI
 */
export async function setupInitialMasterPin(
  newPin: string,
  confirmPin: string,
  keyword: string,
  confirmKeyword: string
): Promise<{ success: boolean; error?: string }> {
  // Validasi PIN
  const cleanPin = newPin.trim();
  const cleanConfirmPin = confirmPin.trim();
  if (cleanPin.length < 6) {
    return { success: false, error: 'Master PIN baru minimal harus 6 karakter/digit!' };
  }
  if (cleanPin !== cleanConfirmPin) {
    return { success: false, error: 'Konfirmasi Master PIN tidak cocok!' };
  }

  // Validasi Kata Kunci Pemulihan
  const cleanKeyword = keyword.trim();
  const cleanConfirmKeyword = confirmKeyword.trim();
  if (!cleanKeyword) {
    return { success: false, error: 'Kata Kunci Pemulihan tidak boleh kosong!' };
  }
  if (cleanKeyword.length < 8) {
    return { success: false, error: 'Kata Kunci Pemulihan minimal harus 8 karakter!' };
  }
  if (cleanKeyword === cleanPin) {
    return { success: false, error: 'Kata Kunci Pemulihan tidak boleh sama dengan Master PIN!' };
  }
  if (cleanKeyword !== cleanConfirmKeyword) {
    return { success: false, error: 'Konfirmasi Kata Kunci Pemulihan tidak cocok!' };
  }

  try {
    // Derivasi hash PBKDF2
    const pinHash = await derivePBKDF2Hash(cleanPin, MASTER_PIN_SALT);
    const keywordHash = await derivePBKDF2Hash(cleanKeyword, RECOVERY_KEYWORD_SALT);

    const newConfig: MasterPinConfig = {
      isConfigured: true,
      pinHash,
      keywordHash,
      updatedAt: Date.now(),
      version: 1,
    };

    // Simpan ke Firestore
    const docRef = doc(db, SETTINGS_COLLECTION, SECURITY_DOC_ID);
    await setDoc(docRef, newConfig, { merge: true });

    // Simpan ke cache lokal
    saveLocalConfigCache(newConfig);

    // Aktifkan sesi dan reset rate limit
    activateSession();
    resetRateLimit();

    return { success: true };
  } catch (err: any) {
    console.error('Error saving initial Master PIN setup:', err);
    return { success: false, error: 'Gagal menyimpan konfigurasi keamanan: ' + (err?.message || String(err)) };
  }
}

/**
 * 2. VERIFIKASI MASTER PIN UNTUK MEMBUKA APLIKASI
 */
export async function verifyMasterPin(
  inputPin: string
): Promise<{ success: boolean; error?: string; lockoutSeconds?: number }> {
  const cooldown = getCooldownRemaining();
  if (cooldown > 0) {
    return {
      success: false,
      error: `Terlalu banyak percobaan gagal. Silakan tunggu ${cooldown} detik sebelum mencoba lagi.`,
      lockoutSeconds: cooldown,
    };
  }

  const cleanInput = inputPin.trim();
  if (!cleanInput) {
    return { success: false, error: 'Silakan masukkan Master PIN.' };
  }

  try {
    const config = await syncPinConfig();
    if (!config.isConfigured || !config.pinHash) {
      return { success: false, error: 'Master PIN belum dikonfigurasi.' };
    }

    const inputHash = await derivePBKDF2Hash(cleanInput, MASTER_PIN_SALT);

    if (inputHash === config.pinHash) {
      activateSession();
      resetRateLimit();
      return { success: true };
    } else {
      const { lockoutSeconds, attemptsLeft } = recordFailedAttempt();
      if (lockoutSeconds > 0) {
        return {
          success: false,
          error: `Master PIN salah! Akun terkunci sementara selama ${lockoutSeconds} detik.`,
          lockoutSeconds,
        };
      }
      return {
        success: false,
        error: `Master PIN salah! Sisa percobaan sebelum terkunci: ${attemptsLeft} kali.`,
      };
    }
  } catch (err: any) {
    console.error('Error verifying Master PIN:', err);
    return { success: false, error: 'Terjadi kesalahan saat memverifikasi Master PIN.' };
  }
}

/**
 * 3. PEMULIHAN MASTER PIN MENGGUNAKAN KATA KUNCI PEMULIHAN (LUPA MASTER PIN)
 */
export async function recoverMasterPinWithKeyword(
  keyword: string,
  newPin: string,
  confirmPin: string
): Promise<{ success: boolean; error?: string; lockoutSeconds?: number }> {
  const cooldown = getCooldownRemaining();
  if (cooldown > 0) {
    return {
      success: false,
      error: `Terlalu banyak percobaan gagal. Silakan tunggu ${cooldown} detik sebelum mencoba lagi.`,
      lockoutSeconds: cooldown,
    };
  }

  const cleanKeyword = keyword.trim();
  if (!cleanKeyword) {
    return { success: false, error: 'Silakan masukkan Kata Kunci Pemulihan.' };
  }

  // Validasi PIN Baru
  const cleanPin = newPin.trim();
  const cleanConfirmPin = confirmPin.trim();
  if (cleanPin.length < 6) {
    return { success: false, error: 'Master PIN baru minimal harus 6 karakter/digit!' };
  }
  if (cleanPin !== cleanConfirmPin) {
    return { success: false, error: 'Konfirmasi Master PIN baru tidak cocok!' };
  }
  if (cleanPin === cleanKeyword) {
    return { success: false, error: 'Master PIN baru tidak boleh sama dengan Kata Kunci Pemulihan!' };
  }

  try {
    const config = await syncPinConfig();
    if (!config.isConfigured || !config.keywordHash) {
      return { success: false, error: 'Konfigurasi pemulihan belum diatur.' };
    }

    // Verifikasi Kata Kunci Pemulihan
    const keywordInputHash = await derivePBKDF2Hash(cleanKeyword, RECOVERY_KEYWORD_SALT);

    if (keywordInputHash !== config.keywordHash) {
      const { lockoutSeconds } = recordFailedAttempt();
      if (lockoutSeconds > 0) {
        return {
          success: false,
          error: `Kata Kunci Pemulihan tidak valid. Silakan periksa kembali. (Terkunci ${lockoutSeconds} detik)`,
          lockoutSeconds,
        };
      }
      return {
        success: false,
        error: 'Kata Kunci Pemulihan tidak valid. Silakan periksa kembali.',
      };
    }

    // Kata Kunci Benar: Setel PIN Baru
    const newPinHash = await derivePBKDF2Hash(cleanPin, MASTER_PIN_SALT);
    const updatedConfig: MasterPinConfig = {
      ...config,
      pinHash: newPinHash,
      updatedAt: Date.now(),
      version: (config.version || 1) + 1,
    };

    const docRef = doc(db, SETTINGS_COLLECTION, SECURITY_DOC_ID);
    await setDoc(docRef, updatedConfig, { merge: true });

    saveLocalConfigCache(updatedConfig);
    activateSession();
    resetRateLimit();

    return { success: true };
  } catch (err: any) {
    console.error('Error during PIN recovery:', err);
    return { success: false, error: 'Gagal memproses pemulihan: ' + (err?.message || String(err)) };
  }
}

/**
 * 4. PENGATURAN KEAMANAN: GANTI MASTER PIN
 */
export async function changeMasterPin(
  currentPin: string,
  newPin: string,
  confirmPin: string
): Promise<{ success: boolean; error?: string }> {
  const cleanCurrentPin = currentPin.trim();
  const cleanNewPin = newPin.trim();
  const cleanConfirmPin = confirmPin.trim();

  if (cleanNewPin.length < 6) {
    return { success: false, error: 'Master PIN baru minimal harus 6 karakter/digit!' };
  }
  if (cleanNewPin !== cleanConfirmPin) {
    return { success: false, error: 'Konfirmasi Master PIN baru tidak cocok!' };
  }
  if (cleanCurrentPin === cleanNewPin) {
    return { success: false, error: 'Master PIN baru tidak boleh sama dengan PIN saat ini!' };
  }

  try {
    const config = await syncPinConfig();
    const currentHash = await derivePBKDF2Hash(cleanCurrentPin, MASTER_PIN_SALT);

    if (currentHash !== config.pinHash) {
      return { success: false, error: 'Master PIN saat ini yang Anda masukkan salah!' };
    }

    const newPinHash = await derivePBKDF2Hash(cleanNewPin, MASTER_PIN_SALT);
    const updatedConfig: MasterPinConfig = {
      ...config,
      pinHash: newPinHash,
      updatedAt: Date.now(),
      version: (config.version || 1) + 1,
    };

    const docRef = doc(db, SETTINGS_COLLECTION, SECURITY_DOC_ID);
    await setDoc(docRef, updatedConfig, { merge: true });

    saveLocalConfigCache(updatedConfig);
    activateSession();

    return { success: true };
  } catch (err: any) {
    console.error('Error changing Master PIN:', err);
    return { success: false, error: 'Gagal mengubah Master PIN: ' + (err?.message || String(err)) };
  }
}

/**
 * 5. PENGATURAN KEAMANAN: GANTI KATA KUNCI PEMULIHAN
 * Wajib memverifikasi Master PIN yang sedang berlaku.
 */
export async function changeRecoveryKeyword(
  currentPin: string,
  newKeyword: string,
  confirmKeyword: string
): Promise<{ success: boolean; error?: string }> {
  const cleanCurrentPin = currentPin.trim();
  const cleanNewKeyword = newKeyword.trim();
  const cleanConfirmKeyword = confirmKeyword.trim();

  if (!cleanNewKeyword) {
    return { success: false, error: 'Kata Kunci Pemulihan baru tidak boleh kosong!' };
  }
  if (cleanNewKeyword.length < 8) {
    return { success: false, error: 'Kata Kunci Pemulihan baru minimal harus 8 karakter!' };
  }
  if (cleanNewKeyword !== cleanConfirmKeyword) {
    return { success: false, error: 'Konfirmasi Kata Kunci Pemulihan baru tidak cocok!' };
  }
  if (cleanNewKeyword === cleanCurrentPin) {
    return { success: false, error: 'Kata Kunci Pemulihan tidak boleh sama dengan Master PIN!' };
  }

  try {
    const config = await syncPinConfig();
    const currentPinHash = await derivePBKDF2Hash(cleanCurrentPin, MASTER_PIN_SALT);

    if (currentPinHash !== config.pinHash) {
      return { success: false, error: 'Master PIN yang sedang berlaku tidak sesuai!' };
    }

    const newKeywordHash = await derivePBKDF2Hash(cleanNewKeyword, RECOVERY_KEYWORD_SALT);
    const updatedConfig: MasterPinConfig = {
      ...config,
      keywordHash: newKeywordHash,
      updatedAt: Date.now(),
      version: (config.version || 1) + 1,
    };

    const docRef = doc(db, SETTINGS_COLLECTION, SECURITY_DOC_ID);
    await setDoc(docRef, updatedConfig, { merge: true });

    saveLocalConfigCache(updatedConfig);

    return { success: true };
  } catch (err: any) {
    console.error('Error changing Recovery Keyword:', err);
    return { success: false, error: 'Gagal mengubah Kata Kunci Pemulihan: ' + (err?.message || String(err)) };
  }
}
