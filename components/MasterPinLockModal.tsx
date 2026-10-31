import React, { useState, useEffect } from 'react';
import {
  syncPinConfig,
  setupInitialMasterPin,
  verifyMasterPin,
  recoverMasterPinWithKeyword,
  getCooldownRemaining,
} from '../services/pinSecurityService';

interface MasterPinLockModalProps {
  onUnlocked: () => void;
}

export const MasterPinLockModal: React.FC<MasterPinLockModalProps> = ({ onUnlocked }) => {
  const [mode, setMode] = useState<'LOADING' | 'SETUP' | 'ENTER_PIN' | 'RECOVER'>('LOADING');
  
  // Enter PIN State
  const [pinInput, setPinInput] = useState('');
  const [showPin, setShowPin] = useState(false);
  
  // Setup First-Time State
  const [setupPin, setSetupPin] = useState('');
  const [setupConfirmPin, setSetupConfirmPin] = useState('');
  const [setupKeyword, setSetupKeyword] = useState('');
  const [setupConfirmKeyword, setSetupConfirmKeyword] = useState('');
  const [showSetupPin, setShowSetupPin] = useState(false);
  const [showSetupKeyword, setShowSetupKeyword] = useState(false);

  // Recovery State
  const [recoverKeyword, setRecoverKeyword] = useState('');
  const [recoverNewPin, setRecoverNewPin] = useState('');
  const [recoverConfirmPin, setRecoverConfirmPin] = useState('');
  const [showRecoverKeyword, setShowRecoverKeyword] = useState(false);
  const [showRecoverPin, setShowRecoverPin] = useState(false);

  // Messages & Status
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);

  // Check initial configuration
  useEffect(() => {
    let isMounted = true;
    syncPinConfig()
      .then((config) => {
        if (!isMounted) return;
        if (config.isConfigured && config.pinHash) {
          setMode('ENTER_PIN');
        } else {
          setMode('SETUP');
        }
      })
      .catch(() => {
        if (isMounted) setMode('ENTER_PIN');
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // Cooldown countdown timer
  useEffect(() => {
    const cd = getCooldownRemaining();
    setCooldownSeconds(cd);

    if (cd > 0) {
      const interval = setInterval(() => {
        setCooldownSeconds((prev) => {
          if (prev <= 1) {
            clearInterval(interval);
            setErrorMsg(null);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [errorMsg]);

  // Handler: Setup First-Time
  const handleSetupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    setIsSubmitting(true);

    const res = await setupInitialMasterPin(
      setupPin,
      setupConfirmPin,
      setupKeyword,
      setupConfirmKeyword
    );

    setIsSubmitting(false);
    if (res.success) {
      setSuccessMsg('Master PIN & Kata Kunci Pemulihan berhasil disimpan!');
      setTimeout(() => {
        onUnlocked();
      }, 600);
    } else {
      setErrorMsg(res.error || 'Gagal menyimpan konfigurasi keamanan.');
    }
  };

  // Handler: Enter PIN Login
  const handlePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cooldownSeconds > 0) return;

    setErrorMsg(null);
    setIsSubmitting(true);

    const res = await verifyMasterPin(pinInput);
    setIsSubmitting(false);

    if (res.success) {
      onUnlocked();
    } else {
      setErrorMsg(res.error || 'Master PIN salah.');
      if (res.lockoutSeconds) {
        setCooldownSeconds(res.lockoutSeconds);
      }
    }
  };

  // Handler: Recover PIN with Keyword
  const handleRecoverSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cooldownSeconds > 0) return;

    setErrorMsg(null);
    setSuccessMsg(null);
    setIsSubmitting(true);

    const res = await recoverMasterPinWithKeyword(
      recoverKeyword,
      recoverNewPin,
      recoverConfirmPin
    );

    setIsSubmitting(false);
    if (res.success) {
      setSuccessMsg('Master PIN baru berhasil dibuat! Membuka aplikasi...');
      setTimeout(() => {
        onUnlocked();
      }, 800);
    } else {
      setErrorMsg(res.error || 'Kata Kunci Pemulihan tidak valid. Silakan periksa kembali.');
      if (res.lockoutSeconds) {
        setCooldownSeconds(res.lockoutSeconds);
      }
    }
  };

  if (mode === 'LOADING') {
    return (
      <div className="w-full max-w-md p-8 rounded-3xl bg-[#0c121e]/90 border border-white/10 backdrop-blur-2xl shadow-[0_20px_50px_rgba(0,0,0,0.9)] text-center animate-fade-scale">
        <div className="w-12 h-12 border-3 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <p className="text-xs font-bold text-slate-300 uppercase tracking-widest">Menyiapkan Keamanan Vault...</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md p-6 sm:p-8 rounded-3xl bg-[#0c121e]/95 border border-cyan-500/20 backdrop-blur-2xl shadow-[0_20px_60px_rgba(0,0,0,0.85)] relative z-20 animate-fade-scale">
      {/* Decorative top badge */}
      <div className="flex justify-center mb-4">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-2xl shadow-[0_0_25px_rgba(6,182,212,0.4)] border border-cyan-300/30">
          {mode === 'SETUP' ? '🛡️' : mode === 'RECOVER' ? '🔑' : '🔐'}
        </div>
      </div>

      {/* Title & Subtitle */}
      <div className="text-center mb-6">
        <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight uppercase">
          {mode === 'SETUP'
            ? 'Setup Master PIN'
            : mode === 'RECOVER'
            ? 'Pemulihan Master PIN'
            : 'SevenProject Vault'}
        </h2>
        <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
          {mode === 'SETUP'
            ? 'Buat Master PIN baru & Kata Kunci Pemulihan untuk melindungi seluruh bookmark Anda.'
            : mode === 'RECOVER'
            ? 'Masukkan Kata Kunci Pemulihan yang telah dibuat sebelumnya untuk mengatur ulang Master PIN.'
            : 'Masukkan Master PIN Anda untuk membuka dan mengelola shortcut.'}
        </p>
      </div>

      {/* Notifications */}
      {errorMsg && (
        <div className="mb-4 p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-semibold flex items-center gap-2 animate-shake">
          <span>⚠️</span>
          <span className="flex-1">{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div className="mb-4 p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-semibold flex items-center gap-2">
          <span>✅</span>
          <span className="flex-1">{successMsg}</span>
        </div>
      )}

      {/* -------------------- MODE 1: ENTER PIN -------------------- */}
      {mode === 'ENTER_PIN' && (
        <form onSubmit={handlePinSubmit} className="space-y-4">
          <div>
            <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1.5">
              Master PIN
            </label>
            <div className="relative">
              <input
                type={showPin ? 'text' : 'password'}
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                placeholder="Masukkan Master PIN..."
                autoFocus
                disabled={isSubmitting || cooldownSeconds > 0}
                className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 text-sm focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 transition-all font-mono tracking-widest"
              />
              <button
                type="button"
                onClick={() => setShowPin(!showPin)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs px-2 py-1 rounded transition-colors cursor-pointer"
              >
                {showPin ? 'Sembunyikan' : 'Tampilkan'}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting || cooldownSeconds > 0}
            className="w-full py-3 px-4 rounded-xl font-black text-sm uppercase tracking-wider text-slate-950 bg-gradient-to-r from-cyan-400 to-blue-500 hover:from-cyan-300 hover:to-blue-400 transition-all duration-200 shadow-[0_4px_20px_rgba(6,182,212,0.35)] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2"
          >
            {isSubmitting ? (
              <>
                <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></div>
                <span>Memverifikasi...</span>
              </>
            ) : cooldownSeconds > 0 ? (
              <span>Terkunci ({cooldownSeconds}s)</span>
            ) : (
              <span>Buka Kunci Akses 🚀</span>
            )}
          </button>

          <div className="text-center pt-2 border-t border-white/5">
            <button
              type="button"
              onClick={() => {
                setErrorMsg(null);
                setSuccessMsg(null);
                setMode('RECOVER');
              }}
              className="text-xs text-cyan-400/90 hover:text-cyan-300 hover:underline transition-all cursor-pointer font-medium"
            >
              Lupa Master PIN? Pulihkan di sini.
            </button>
          </div>
        </form>
      )}

      {/* -------------------- MODE 2: FIRST-TIME SETUP -------------------- */}
      {mode === 'SETUP' && (
        <form onSubmit={handleSetupSubmit} className="space-y-3.5">
          {/* Master PIN Baru */}
          <div>
            <label className="block text-[10px] font-bold text-slate-300 uppercase tracking-wider mb-1">
              Master PIN Baru <span className="text-cyan-400 font-normal">(min. 6 digit)</span>
            </label>
            <div className="relative">
              <input
                type={showSetupPin ? 'text' : 'password'}
                value={setupPin}
                onChange={(e) => setSetupPin(e.target.value)}
                placeholder="Buat Master PIN baru..."
                required
                className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 text-xs focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 font-mono tracking-wider"
              />
              <button
                type="button"
                onClick={() => setShowSetupPin(!showSetupPin)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-[10px] px-1.5 py-0.5 rounded cursor-pointer"
              >
                {showSetupPin ? 'Sembunyi' : 'Lihat'}
              </button>
            </div>
          </div>

          {/* Konfirmasi Master PIN */}
          <div>
            <label className="block text-[10px] font-bold text-slate-300 uppercase tracking-wider mb-1">
              Konfirmasi Master PIN Baru
            </label>
            <input
              type={showSetupPin ? 'text' : 'password'}
              value={setupConfirmPin}
              onChange={(e) => setSetupConfirmPin(e.target.value)}
              placeholder="Ulangi Master PIN..."
              required
              className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 text-xs focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 font-mono tracking-wider"
            />
          </div>

          <div className="pt-2 border-t border-white/5">
            <span className="text-[10px] font-black uppercase text-amber-400/90 tracking-wider block mb-1">
              🔑 Kredensial Pemulihan Cadangan
            </span>
            <p className="text-[10px] text-slate-400 mb-2 leading-relaxed">
              Kata kunci pemulihan digunakan jika Anda lupa Master PIN. Minimal 8 karakter dan tidak boleh sama dengan PIN.
            </p>
          </div>

          {/* Kata Kunci Pemulihan */}
          <div>
            <label className="block text-[10px] font-bold text-slate-300 uppercase tracking-wider mb-1">
              Kata Kunci Pemulihan <span className="text-amber-400 font-normal">(min. 8 karakter)</span>
            </label>
            <div className="relative">
              <input
                type={showSetupKeyword ? 'text' : 'password'}
                value={setupKeyword}
                onChange={(e) => setSetupKeyword(e.target.value)}
                placeholder="Contoh: KucingHitamLompat99"
                required
                className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 text-xs focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400"
              />
              <button
                type="button"
                onClick={() => setShowSetupKeyword(!showSetupKeyword)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-[10px] px-1.5 py-0.5 rounded cursor-pointer"
              >
                {showSetupKeyword ? 'Sembunyi' : 'Lihat'}
              </button>
            </div>
          </div>

          {/* Konfirmasi Kata Kunci Pemulihan */}
          <div>
            <label className="block text-[10px] font-bold text-slate-300 uppercase tracking-wider mb-1">
              Konfirmasi Kata Kunci Pemulihan
            </label>
            <input
              type={showSetupKeyword ? 'text' : 'password'}
              value={setupConfirmKeyword}
              onChange={(e) => setSetupConfirmKeyword(e.target.value)}
              placeholder="Ulangi Kata Kunci Pemulihan..."
              required
              className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 text-xs focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full mt-2 py-3 px-4 rounded-xl font-black text-xs uppercase tracking-wider text-slate-950 bg-gradient-to-r from-cyan-400 via-teal-300 to-blue-500 hover:opacity-95 transition-all shadow-[0_4px_20px_rgba(6,182,212,0.35)] disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
          >
            {isSubmitting ? (
              <>
                <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></div>
                <span>Menyimpan Keamanan...</span>
              </>
            ) : (
              <span>Simpan & Aktifkan Keamanan 🚀</span>
            )}
          </button>
        </form>
      )}

      {/* -------------------- MODE 3: RECOVER PIN WITH KEYWORD -------------------- */}
      {mode === 'RECOVER' && (
        <form onSubmit={handleRecoverSubmit} className="space-y-3.5">
          {/* Input Kata Kunci Pemulihan */}
          <div>
            <label className="block text-[10px] font-bold text-slate-300 uppercase tracking-wider mb-1">
              Kata Kunci Pemulihan
            </label>
            <div className="relative">
              <input
                type={showRecoverKeyword ? 'text' : 'password'}
                value={recoverKeyword}
                onChange={(e) => setRecoverKeyword(e.target.value)}
                placeholder="Masukkan Kata Kunci Pemulihan..."
                required
                autoFocus
                disabled={isSubmitting || cooldownSeconds > 0}
                className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 text-xs focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400"
              />
              <button
                type="button"
                onClick={() => setShowRecoverKeyword(!showRecoverKeyword)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-[10px] px-1.5 py-0.5 rounded cursor-pointer"
              >
                {showRecoverKeyword ? 'Sembunyi' : 'Lihat'}
              </button>
            </div>
          </div>

          {/* Master PIN Baru */}
          <div>
            <label className="block text-[10px] font-bold text-slate-300 uppercase tracking-wider mb-1">
              Master PIN Baru <span className="text-cyan-400 font-normal">(min. 6 digit)</span>
            </label>
            <div className="relative">
              <input
                type={showRecoverPin ? 'text' : 'password'}
                value={recoverNewPin}
                onChange={(e) => setRecoverNewPin(e.target.value)}
                placeholder="Ketik Master PIN baru..."
                required
                disabled={isSubmitting || cooldownSeconds > 0}
                className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 text-xs focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 font-mono tracking-wider"
              />
              <button
                type="button"
                onClick={() => setShowRecoverPin(!showRecoverPin)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-[10px] px-1.5 py-0.5 rounded cursor-pointer"
              >
                {showRecoverPin ? 'Sembunyi' : 'Lihat'}
              </button>
            </div>
          </div>

          {/* Konfirmasi Master PIN Baru */}
          <div>
            <label className="block text-[10px] font-bold text-slate-300 uppercase tracking-wider mb-1">
              Konfirmasi Master PIN Baru
            </label>
            <input
              type={showRecoverPin ? 'text' : 'password'}
              value={recoverConfirmPin}
              onChange={(e) => setRecoverConfirmPin(e.target.value)}
              placeholder="Ulangi Master PIN baru..."
              required
              disabled={isSubmitting || cooldownSeconds > 0}
              className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 text-xs focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 font-mono tracking-wider"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting || cooldownSeconds > 0}
            className="w-full mt-2 py-3 px-4 rounded-xl font-black text-xs uppercase tracking-wider text-slate-950 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 transition-all shadow-[0_4px_20px_rgba(245,158,11,0.35)] disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
          >
            {isSubmitting ? (
              <>
                <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></div>
                <span>Memverifikasi Kata Kunci...</span>
              </>
            ) : cooldownSeconds > 0 ? (
              <span>Terkunci ({cooldownSeconds}s)</span>
            ) : (
              <span>Verifikasi & Atur Ulang PIN 🔄</span>
            )}
          </button>

          <div className="text-center pt-2 border-t border-white/5">
            <button
              type="button"
              onClick={() => {
                setErrorMsg(null);
                setSuccessMsg(null);
                setMode('ENTER_PIN');
              }}
              className="text-xs text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              ← Kembali ke Masukkan PIN
            </button>
          </div>
        </form>
      )}

      {/* Security notice at bottom */}
      <div className="mt-6 pt-3 border-t border-white/5 text-center">
        <p className="text-[9px] text-white/30 uppercase tracking-widest font-mono">
          PBKDF2-SHA256 • 100,000 Iterations • Client-Side Encryption
        </p>
      </div>
    </div>
  );
};

export default MasterPinLockModal;
