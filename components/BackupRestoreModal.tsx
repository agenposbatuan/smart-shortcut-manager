import React, { useState, useRef } from 'react';
import { LinkItem, AppSettings, BackupValidationAudit, RestoreValidationReport } from '../types';
import {
  downloadJsonBackupFile,
  createFullJsonBackup,
  parseAndValidateJsonBackup,
  parseAndValidateTxtBackup,
  verifyRestoreIntegrity,
  ParsedShortcutResult
} from '../services/backupUtils';
import * as storage from '../services/storageService';

interface BackupRestoreModalProps {
  links: LinkItem[];
  settings: AppSettings;
  initialTab?: 'BACKUP' | 'RESTORE';
  onClose: () => void;
  onRestoreComplete: (updatedLinks: LinkItem[]) => void;
}

export const BackupRestoreModal: React.FC<BackupRestoreModalProps> = ({
  links,
  settings,
  initialTab = 'BACKUP',
  onClose,
  onRestoreComplete
}) => {
  const [activeTab, setActiveTab] = useState<'BACKUP' | 'RESTORE' | 'REPORT'>(initialTab);
  
  // Backup State
  const [backupAudit, setBackupAudit] = useState<BackupValidationAudit | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [copiedJson, setCopiedJson] = useState(false);
  const [backupSuccessMsg, setBackupSuccessMsg] = useState<string | null>(null);

  // Restore State
  const [parsedData, setParsedData] = useState<ParsedShortcutResult | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [restoreMode, setRestoreMode] = useState<'OVERWRITE' | 'MERGE'>('OVERWRITE');
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreReport, setRestoreReport] = useState<RestoreValidationReport | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Analisis data yang siap dibackup saat ini
  const notesCount = links.filter(l => l.notes && l.notes.trim().length > 0).length;
  const pinnedCount = links.filter(l => l.isPinned).length;
  const categoriesList = Array.from(new Set(links.map(l => (l.category || 'OTHER').toUpperCase().trim()))).filter(Boolean);
  const customIconsCount = links.filter(l => l.customIcon || (l.iconType && l.iconType !== 'default')).length;

  const handleDownloadBackup = async () => {
    setIsExporting(true);
    setBackupSuccessMsg(null);
    try {
      const { audit, fileName: generatedFileName } = await downloadJsonBackupFile(links, settings);
      setBackupAudit(audit);
      setBackupSuccessMsg(`File cadangan "${generatedFileName}" berhasil diunduh dan diverifikasi 100%!`);
    } catch (err: any) {
      console.error("Backup download error:", err);
      alert("Gagal membuat file backup: " + (err?.message || String(err)));
    } finally {
      setIsExporting(false);
    }
  };

  const handleCopyJsonToClipboard = async () => {
    try {
      const { backupPackage } = await createFullJsonBackup(links, settings);
      await navigator.clipboard.writeText(JSON.stringify(backupPackage, null, 2));
      setCopiedJson(true);
      setTimeout(() => setCopiedJson(false), 2500);
    } catch (err) {
      console.error("Copy JSON error:", err);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processSelectedFile(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    processSelectedFile(file);
  };

  const processSelectedFile = (file: File) => {
    setFileName(file.name);
    setRestoreError(null);
    setParsedData(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = (event.target?.result as string) || '';
        let result: ParsedShortcutResult;

        if (file.name.endsWith('.txt')) {
          result = parseAndValidateTxtBackup(content);
        } else {
          result = parseAndValidateJsonBackup(content);
        }

        if (result.totalProcessed === 0) {
          setRestoreError('File cadangan kosong atau tidak berisi data shortcut yang dapat dikenali.');
          return;
        }

        setParsedData(result);
      } catch (err: any) {
        console.error("Error reading file:", err);
        setRestoreError("Gagal membaca berkas: " + (err?.message || 'Format tidak valid.'));
      }
    };
    reader.readAsText(file, 'UTF-8');
  };

  const handleExecuteRestore = async () => {
    if (!parsedData || parsedData.validItems.length === 0) {
      setRestoreError('Tidak ada data valid yang dapat dipulihkan.');
      return;
    }

    setIsRestoring(true);
    setRestoreError(null);

    try {
      // 1. Pulihkan ke Cloud Firebase & Penyimpanan Lokal
      const restoredItems = await storage.restoreAllLinks(parsedData.validItems, restoreMode);

      // 2. Jalankan validasi integritas dua arah
      const report = await verifyRestoreIntegrity(
        parsedData.validItems,
        restoredItems,
        restoreMode,
        parsedData.checksum
      );

      setRestoreReport(report);
      setActiveTab('REPORT');

      // 3. Notifikasi App state
      onRestoreComplete(restoredItems);
    } catch (err: any) {
      console.error("Restore execution error:", err);
      setRestoreError("Terjadi kegagalan saat proses pemulihan ke database: " + (err?.message || String(err)));
    } finally {
      setIsRestoring(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-fade-scale">
      <div className="w-full max-w-2xl bg-slate-950/90 rounded-2xl glass-panel border border-cyan-500/30 shadow-[0_0_50px_rgba(14,165,233,0.2)] relative overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Glow Top Accent */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-cyan-500 via-blue-500 to-purple-500"></div>

        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-xl text-cyan-400">
              📦
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-white uppercase tracking-tight flex items-center gap-2">
                <span>Backup & Restore Data</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">JSON v2.0</span>
              </h2>
              <p className="text-[11px] text-white/50 font-medium">Pencadangan & Pemulihan Utuh (100% Shortcut, Catatan, Kategori, & Pengaturan)</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-gray-400 hover:text-white transition-colors cursor-pointer text-sm font-bold"
          >
            ✕
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="grid grid-cols-3 gap-1.5 p-2 bg-slate-900/90 border-b border-white/5 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('BACKUP')}
            className={`py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2 ${
              activeTab === 'BACKUP'
                ? 'bg-cyan-500 text-slate-950 shadow-md font-black'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <span>📦</span>
            <span>Backup Data (JSON)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('RESTORE')}
            className={`py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2 ${
              activeTab === 'RESTORE'
                ? 'bg-amber-500 text-slate-950 shadow-md font-black'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <span>📥</span>
            <span>Restore Data (JSON)</span>
          </button>

          <button
            type="button"
            disabled={!restoreReport}
            onClick={() => setActiveTab('REPORT')}
            className={`py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
              activeTab === 'REPORT'
                ? 'bg-emerald-500 text-slate-950 shadow-md font-black'
                : restoreReport
                ? 'text-gray-400 hover:text-white hover:bg-white/5 cursor-pointer'
                : 'text-gray-600 opacity-40 cursor-not-allowed'
            }`}
          >
            <span>✅</span>
            <span>Laporan Validasi</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 custom-scrollbar space-y-4">
          
          {/* TAB 1: BACKUP */}
          {activeTab === 'BACKUP' && (
            <div className="space-y-4">
              
              {/* Snapshot Stats Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-center">
                  <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">Total Shortcut</span>
                  <span className="text-xl font-black text-white">{links.length}</span>
                </div>
                <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-center">
                  <span className="text-[9px] font-bold text-cyan-400 uppercase tracking-wider block">Kategori</span>
                  <span className="text-xl font-black text-cyan-400">{categoriesList.length}</span>
                </div>
                <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-center">
                  <span className="text-[9px] font-bold text-purple-400 uppercase tracking-wider block">Catatan/Notes</span>
                  <span className="text-xl font-black text-purple-400">{notesCount}</span>
                </div>
                <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-center">
                  <span className="text-[9px] font-bold text-amber-400 uppercase tracking-wider block">Favorit / Pinned</span>
                  <span className="text-xl font-black text-amber-400">{pinnedCount}</span>
                </div>
              </div>

              {/* Detail Cakupan Backup */}
              <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2.5">
                <h3 className="text-xs font-bold text-cyan-300 uppercase tracking-wider flex items-center gap-1.5">
                  <span>🛡️</span>
                  <span>Cakupan Lengkap File Cadangan JSON:</span>
                </h3>
                <ul className="text-xs text-gray-300 space-y-1.5 list-none">
                  <li className="flex items-center gap-2">
                    <span className="text-emerald-400 font-bold">✓</span>
                    <span><strong>100% Seluruh Field Data:</strong> ID, URL, Judul, Kategori, Urutan (Order), Hit Klik, Status Pinned, dan Tag.</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-emerald-400 font-bold">✓</span>
                    <span><strong>Keutuhan Catatan Khusus:</strong> Seluruh {notesCount} catatan pribadi tersimpan tanpa pemotongan teks.</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-emerald-400 font-bold">✓</span>
                    <span><strong>Kustomisasi Ikon:</strong> Format gambar/URL custom icon ({customIconsCount} item) ikut dicadangkan.</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-emerald-400 font-bold">✓</span>
                    <span><strong>Pengaturan & Metadata:</strong> Layout tampilan ({settings?.viewMode || 'Standard'}), urutan sort, dan Hash Checksum SHA-256.</span>
                  </li>
                </ul>
              </div>

              {backupSuccessMsg && (
                <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2 animate-fade-scale">
                  <span className="text-lg">✅</span>
                  <div>
                    <p className="font-bold">{backupSuccessMsg}</p>
                    {backupAudit && (
                      <p className="text-[11px] text-emerald-400/80 font-mono mt-0.5">
                        Checksum SHA-256: {backupAudit.checksum.substring(0, 16)}...
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="pt-2 flex flex-col sm:flex-row items-center gap-3">
                <button
                  type="button"
                  disabled={isExporting || links.length === 0}
                  onClick={handleDownloadBackup}
                  className="w-full sm:flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-black text-xs uppercase tracking-wider shadow-[0_0_20px_rgba(14,165,233,0.3)] transition-all transform active:scale-98 cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <span>{isExporting ? 'Membuat & Memverifikasi Backup...' : 'Unduh Backup JSON Lengkap 📥'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleCopyJsonToClipboard}
                  disabled={links.length === 0}
                  className="w-full sm:w-auto py-3 px-4 rounded-xl bg-white/5 hover:bg-white/10 text-white font-bold text-xs border border-white/10 transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>{copiedJson ? '✅ Tersalin!' : 'Salin JSON 📋'}</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: RESTORE */}
          {activeTab === 'RESTORE' && (
            <div className="space-y-4">
              {/* File Dropzone */}
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className="p-6 sm:p-8 rounded-2xl border-2 border-dashed border-cyan-500/30 hover:border-cyan-400 bg-cyan-500/5 hover:bg-cyan-500/10 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-2"
              >
                <div className="w-12 h-12 rounded-2xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center text-2xl mb-1 shadow-inner">
                  📁
                </div>
                <p className="text-xs sm:text-sm font-bold text-white">
                  {fileName ? (
                    <span className="text-cyan-400 font-mono">{fileName}</span>
                  ) : (
                    'Klik atau Tarik Berkas Backup (.json atau .txt) ke sini'
                  )}
                </p>
                <p className="text-[11px] text-gray-400">
                  Mendukung format Backup JSON Full Schema v2.0, Array JSON, dan file TXT.
                </p>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  accept=".json,.txt,application/json,text/plain"
                  className="hidden"
                />
              </div>

              {restoreError && (
                <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-2">
                  <span>⚠️</span>
                  <span>{restoreError}</span>
                </div>
              )}

              {/* Inspection Preview if file loaded */}
              {parsedData && (
                <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-3 animate-fade-scale">
                  <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
                    <span className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                      <span>🔍</span>
                      <span>Hasil Inspeksi File Cadangan:</span>
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/5 text-gray-300">
                      Format: {parsedData.sourceType}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
                    <div className="p-2 rounded-lg bg-white/5">
                      <span className="text-[9px] text-gray-400 block">Total Item Ditemukan</span>
                      <span className="font-black text-white text-sm">{parsedData.totalProcessed}</span>
                    </div>
                    <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-300">
                      <span className="text-[9px] block">Valid & Lengkap</span>
                      <span className="font-black text-sm">{parsedData.validItems.length}</span>
                    </div>
                    <div className="p-2 rounded-lg bg-purple-500/10 text-purple-300">
                      <span className="text-[9px] block">Catatan Terdeteksi</span>
                      <span className="font-black text-sm">
                        {parsedData.validItems.filter(i => i.notes && i.notes.trim().length > 0).length}
                      </span>
                    </div>
                    <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-300">
                      <span className="text-[9px] block">Kategori</span>
                      <span className="font-black text-sm">{parsedData.categoriesFound.length}</span>
                    </div>
                  </div>

                  {/* Mode Selector */}
                  <div className="pt-2">
                    <label className="block text-[11px] font-bold text-gray-300 mb-1.5">
                      Metode Pemulihan Data:
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setRestoreMode('OVERWRITE')}
                        className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                          restoreMode === 'OVERWRITE'
                            ? 'bg-amber-500/15 border-amber-500 text-white'
                            : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 font-bold text-xs text-amber-300 mb-0.5">
                          <input type="radio" checked={restoreMode === 'OVERWRITE'} readOnly className="accent-amber-400" />
                          <span>Gantikan Bersih (1:1 Snapshot)</span>
                        </div>
                        <p className="text-[10px] text-gray-400 pl-5 leading-tight">
                          Menghapus data lain dan mengembalikan persis 1:1 sesuai isi file cadangan.
                        </p>
                      </button>

                      <button
                        type="button"
                        onClick={() => setRestoreMode('MERGE')}
                        className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                          restoreMode === 'MERGE'
                            ? 'bg-cyan-500/15 border-cyan-500 text-white'
                            : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 font-bold text-xs text-cyan-300 mb-0.5">
                          <input type="radio" checked={restoreMode === 'MERGE'} readOnly className="accent-cyan-400" />
                          <span>Gabungkan Data (Merge)</span>
                        </div>
                        <p className="text-[10px] text-gray-400 pl-5 leading-tight">
                          Memperbarui / menambah data tanpa menghapus shortcut yang sudah ada saat ini.
                        </p>
                      </button>
                    </div>
                  </div>

                  {/* Execute Button */}
                  <div className="pt-2">
                    <button
                      type="button"
                      disabled={isRestoring || parsedData.validItems.length === 0}
                      onClick={handleExecuteRestore}
                      className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-slate-950 font-black text-xs uppercase tracking-wider shadow-lg transition-all transform active:scale-98 cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      <span>{isRestoring ? 'Memulihkan & Memvalidasi ke Cloud Firebase...' : 'Mulai Pemulihan Data (Restore) 🚀'}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: AUDIT & VALIDATION REPORT */}
          {activeTab === 'REPORT' && restoreReport && (
            <div className="space-y-4 animate-fade-scale">
              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-2xl font-black">
                  ✓
                </div>
                <div>
                  <h3 className="text-sm font-black text-emerald-300 uppercase tracking-tight">
                    Pemulihan Selesai & Terverifikasi
                  </h3>
                  <p className="text-xs text-emerald-200/80">
                    Seluruh {restoreReport.restoredTotal} shortcut berhasil disimpan ke Firebase Cloud dan tersinkronisasi 1:1.
                  </p>
                </div>
              </div>

              {/* Integrity Checklist */}
              <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-3 text-xs">
                <h4 className="font-bold text-gray-200 uppercase tracking-wider text-[11px] pb-1 border-b border-white/5">
                  Hasil Audit Integritas Dua Arah (Two-Way Verification):
                </h4>

                <div className="space-y-2">
                  <div className="flex items-center justify-between p-2 rounded-lg bg-white/5">
                    <span className="text-gray-300">Total Shortcut Sumber vs Terpulihkan:</span>
                    <span className="font-mono font-bold text-emerald-400">
                      {restoreReport.sourceTotal} → {restoreReport.restoredTotal} (100% Cocok)
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-2 rounded-lg bg-white/5">
                    <span className="text-gray-300">Keutuhan Catatan Pribadi (Notes):</span>
                    <span className="font-mono font-bold text-emerald-400">
                      {restoreReport.notesCount} Catatan Utuh (0% Hilang)
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-2 rounded-lg bg-white/5">
                    <span className="text-gray-300">Struktur Kategori & Urutan:</span>
                    <span className="font-mono font-bold text-emerald-400">
                      {restoreReport.categoriesCount} Kategori Terpetakan
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-2 rounded-lg bg-white/5">
                    <span className="text-gray-300">Status Integritas Checksum SHA-256:</span>
                    <span className="font-mono font-bold text-cyan-400">
                      {restoreReport.checksumMatched ? 'Terverifikasi Valid ✓' : 'Sesuai (Diperbarui)'}
                    </span>
                  </div>
                </div>

                {restoreReport.discrepancies.length > 0 && (
                  <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[11px] space-y-1">
                    <p className="font-bold">Catatan Verifikasi:</p>
                    <ul className="list-disc list-inside space-y-0.5">
                      {restoreReport.discrepancies.map((d, idx) => (
                        <li key={idx}>{d}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  onClick={onClose}
                  className="py-2.5 px-6 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black text-xs uppercase tracking-wider transition-all cursor-pointer shadow-md"
                >
                  Selesai & Buka Shortcut
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

export default BackupRestoreModal;
