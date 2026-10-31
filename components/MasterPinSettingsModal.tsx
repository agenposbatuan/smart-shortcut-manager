import React, { useState } from 'react';
import {
  changeMasterPin,
  changeRecoveryKeyword,
} from '../services/pinSecurityService';

interface MasterPinSettingsModalProps {
  onClose: () => void;
  onLock: () => void;
}

export const MasterPinSettingsModal: React.FC<MasterPinSettingsModalProps> = ({
  onClose,
  onLock,
}) => {
  const [activeTab, setActiveTab] = useState<'PIN' | 'KEYWORD'>('PIN');

  // Tab 1: Ganti Master PIN
  const [currentPinForPinChange, setCurrentPinForPinChange] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmNewPin, setConfirmNewPin] = useState('');
  const [showPinFields, setShowPinFields] = useState(false);

  // Tab 2: Ganti Kata Kunci Pemulihan
  const [currentPinForKeywordChange, setCurrentPinForKeywordChange] = useState('');
  const [newKeyword, setNewKeyword] = useState('');
  const [confirmNewKeyword, setConfirmNewKeyword] = useState('');
  const [showKeywordFields, setShowKeywordFields] = useState(false);

  // Status
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Handle Change PIN
  const handleChangePin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    setIsSubmitting(true);

    const res = await changeMasterPin(
      currentPinForPinChange,
      newPin,
      confirmNewPin
    );
    setIsSubmitting(false);

    if (res.success) {
      setSuccessMsg('Master PIN berhasil diperbarui!');
      setCurrentPinForPinChange('');
      setNewPin('');
      setConfirmNewPin('');
    } else {
      setErrorMsg(res.error || 'Gagal mengubah Master PIN.');
    }
  };

  // Handle Change Recovery Keyword
  const handleChangeKeyword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    setIsSubmitting(true);

    const res = await changeRecoveryKeyword(
      currentPinForKeywordChange,
      newKeyword,
      confirmNewKeyword
    );
    setIsSubmitting(false);

    if (res.success) {
      setSuccessMsg('Kata Kunci Pemulihan berhasil diperbarui!');
      setCurrentPinForKeywordChange('');
      setNewKeyword('');
      setConfirmNewKeyword('');
    } else {
      setErrorMsg(res.error || 'Gagal mengubah Kata Kunci Pemulihan.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div 
        className="fixed inset-0" 
        onClick={onClose} 
      />
      <div className="relative w-full max-w-lg rounded-3xl bg-[#0c121e] border border-cyan-500/30 p-5 sm:p-7 shadow-[0_20px_50px_rgba(0,0,0,0.9)] z-10 animate-fade-scale">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/5 mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-xl text-cyan-400">
              🛡️
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black text-white uppercase tracking-tight">
                Pengaturan Keamanan Vault
              </h3>
              <p className="text-[11px] text-slate-400">
                Kelola Master PIN & Kata Kunci Pemulihan Anda
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Tab Buttons */}
        <div className="grid grid-cols-2 gap-2 p-1 bg-white/5 rounded-2xl mb-5">
          <button
            type="button"
            onClick={() => {
              setActiveTab('PIN');
              setErrorMsg(null);
              setSuccessMsg(null);
            }}
            className={`py-2 px-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
              activeTab === 'PIN'
                ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-[0_2px_10px_rgba(6,182,212,0.3)]'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            🔐 Ganti Master PIN
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('KEYWORD');
              setErrorMsg(null);
              setSuccessMsg(null);
            }}
            className={`py-2 px-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
              activeTab === 'KEYWORD'
                ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-white shadow-[0_2px_10px_rgba(245,158,11,0.3)]'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            🔑 Ganti Kata Kunci
          </button>
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

        {/* TAB 1: GANTI MASTER PIN */}
        {activeTab === 'PIN' && (
          <form onSubmit={handleChangePin} className="space-y-3.5">
            <div>
              <label className="block text-[10px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                Master PIN Saat Ini
              </label>
              <div className="relative">
                <input
                  type={showPinFields ? 'text' : 'password'}
                  value={currentPinForPinChange}
                  onChange={(e) => setCurrentPinForPinChange(e.target.value)}
                  placeholder="Ketik Master PIN saat ini..."
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs placeholder-white/30 focus:outline-none focus:border-cyan-400 font-mono tracking-wider"
                />
                <button
                  type="button"
                  onClick={() => setShowPinFields(!showPinFields)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-[10px] px-1.5 py-0.5 rounded cursor-pointer"
                >
                  {showPinFields ? 'Sembunyi' : 'Lihat'}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                Master PIN Baru <span className="text-cyan-400 font-normal">(min. 6 digit)</span>
              </label>
              <input
                type={showPinFields ? 'text' : 'password'}
                value={newPin}
                onChange={(e) => setNewPin(e.target.value)}
                placeholder="Ketik Master PIN baru..."
                required
                className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs placeholder-white/30 focus:outline-none focus:border-cyan-400 font-mono tracking-wider"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                Konfirmasi Master PIN Baru
              </label>
              <input
                type={showPinFields ? 'text' : 'password'}
                value={confirmNewPin}
                onChange={(e) => setConfirmNewPin(e.target.value)}
                placeholder="Ulangi Master PIN baru..."
                required
                className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs placeholder-white/30 focus:outline-none focus:border-cyan-400 font-mono tracking-wider"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full mt-2 py-3 px-4 rounded-xl font-black text-xs uppercase tracking-wider text-slate-950 bg-gradient-to-r from-cyan-400 to-blue-500 hover:opacity-95 transition-all shadow-[0_4px_15px_rgba(6,182,212,0.3)] disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></div>
                  <span>Menyimpan Master PIN...</span>
                </>
              ) : (
                <span>Perbarui Master PIN 💾</span>
              )}
            </button>
          </form>
        )}

        {/* TAB 2: GANTI KATA KUNCI PEMULIHAN */}
        {activeTab === 'KEYWORD' && (
          <form onSubmit={handleChangeKeyword} className="space-y-3.5">
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[11px] leading-relaxed">
              <strong>Verifikasi Diperlukan:</strong> Masukkan Master PIN aktif yang sedang berlaku untuk mengganti Kata Kunci Pemulihan.
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                Master PIN Saat Ini (Verifikasi)
              </label>
              <div className="relative">
                <input
                  type={showKeywordFields ? 'text' : 'password'}
                  value={currentPinForKeywordChange}
                  onChange={(e) => setCurrentPinForKeywordChange(e.target.value)}
                  placeholder="Masukkan Master PIN saat ini..."
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs placeholder-white/30 focus:outline-none focus:border-amber-400 font-mono tracking-wider"
                />
                <button
                  type="button"
                  onClick={() => setShowKeywordFields(!showKeywordFields)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-[10px] px-1.5 py-0.5 rounded cursor-pointer"
                >
                  {showKeywordFields ? 'Sembunyi' : 'Lihat'}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                Kata Kunci Pemulihan Baru <span className="text-amber-400 font-normal">(min. 8 karakter)</span>
              </label>
              <input
                type={showKeywordFields ? 'text' : 'password'}
                value={newKeyword}
                onChange={(e) => setNewKeyword(e.target.value)}
                placeholder="Ketik Kata Kunci Pemulihan baru..."
                required
                className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs placeholder-white/30 focus:outline-none focus:border-amber-400"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                Konfirmasi Kata Kunci Pemulihan Baru
              </label>
              <input
                type={showKeywordFields ? 'text' : 'password'}
                value={confirmNewKeyword}
                onChange={(e) => setConfirmNewKeyword(e.target.value)}
                placeholder="Ulangi Kata Kunci Pemulihan baru..."
                required
                className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs placeholder-white/30 focus:outline-none focus:border-amber-400"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full mt-2 py-3 px-4 rounded-xl font-black text-xs uppercase tracking-wider text-slate-950 bg-gradient-to-r from-amber-400 to-amber-500 hover:opacity-95 transition-all shadow-[0_4px_15px_rgba(245,158,11,0.3)] disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></div>
                  <span>Menyimpan Kata Kunci...</span>
                </>
              ) : (
                <span>Perbarui Kata Kunci Pemulihan 💾</span>
              )}
            </button>
          </form>
        )}

        {/* Quick Lock Footer */}
        <div className="mt-6 pt-4 border-t border-white/5 flex items-center justify-between">
          <button
            type="button"
            onClick={() => {
              onLock();
              onClose();
            }}
            className="px-3 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs font-bold transition-all border border-rose-500/20 cursor-pointer flex items-center gap-1.5"
          >
            <span>🔒</span>
            <span>Kunci Aplikasi Sekarang</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white text-xs font-bold transition-all cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};

export default MasterPinSettingsModal;
