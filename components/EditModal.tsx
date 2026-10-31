import React, { useState, useRef, useEffect } from 'react';
import { LinkItem } from '../types';

interface EditModalProps {
  editingLink: LinkItem;
  existingCategories: string[];
  onClose: () => void;
  onSave: (updatedLink: LinkItem) => Promise<void>;
  onCategoryChange?: (newCat: string) => void;
}

export const EditModal: React.FC<EditModalProps> = ({
  editingLink,
  existingCategories,
  onClose,
  onSave,
  onCategoryChange
}) => {
  const [activeTab, setActiveTab] = useState<'GENERAL' | 'ICON' | 'ADVANCED'>('GENERAL');
  
  // Form state
  const [title, setTitle] = useState(editingLink.title || '');
  const [url, setUrl] = useState(editingLink.url || '');
  const [category, setCategory] = useState(editingLink.category || '');
  const [order, setOrder] = useState<number>(editingLink.order || 1);
  const [notes, setNotes] = useState(editingLink.notes || '');

  // Personal Notes Separator & View State
  const [notesViewMode, setNotesViewMode] = useState<'EDIT' | 'PREVIEW'>('EDIT');
  const [copyNotice, setCopyNotice] = useState<string | null>(null);
  const notesTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Sisipkan Garis Pemisah pada posisi kursor aktif
  const handleInsertSeparator = () => {
    const textarea = notesTextareaRef.current;
    if (!textarea) {
      setNotes((prev) => (prev ? `${prev.trim()}\n\n<hr>\n\n` : '<hr>\n\n'));
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const currentText = notes;
    const before = currentText.substring(0, start);
    const after = currentText.substring(end);

    const needsLeadingNewline = before.length > 0 && !before.endsWith('\n\n') && !before.endsWith('\n');
    const needsTrailingNewline = after.length > 0 && !after.startsWith('\n\n') && !after.startsWith('\n');

    const prefix = needsLeadingNewline ? (before.endsWith('\n') ? '\n' : '\n\n') : '';
    const suffix = needsTrailingNewline ? (after.startsWith('\n') ? '\n' : '\n\n') : (after.length === 0 ? '\n\n' : '');

    const insertText = `${prefix}<hr>${suffix}`;
    const updatedNotes = before + insertText + after;
    setNotes(updatedNotes);

    setTimeout(() => {
      textarea.focus();
      const newCursorPos = start + insertText.length;
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 10);
  };

  // Salin template garis pemisah ke clipboard
  const handleCopyTemplate = async () => {
    const templateText = `PROMPT GENERATOR\nhttps://example.com/link-1\n\n<hr>\n\nAI IMAGE GENERATOR\nhttps://example.com/link-2\n\n<hr>\n\nAI VIDEO GENERATOR\nhttps://example.com/link-3`;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(templateText);
      } else {
        const ta = document.createElement('textarea');
        ta.value = templateText;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopyNotice('Template pemisah berhasil disalin!');
      setTimeout(() => setCopyNotice(null), 2500);
    } catch (err) {
      console.warn('Clipboard copy error, fallback:', err);
      setCopyNotice('Template pemisah berhasil disalin!');
      setTimeout(() => setCopyNotice(null), 2500);
    }
  };

  // Render teks Personal Notes dengan elemen garis horizontal 100% width
  const renderPersonalNotes = (notesText: string) => {
    if (!notesText || !notesText.trim()) {
      return (
        <div className="text-center py-6 text-white/30 text-xs italic">
          Belum ada catatan tambahan.
        </div>
      );
    }

    const sections = notesText.split(/\s*<hr\s*\/?>\s*|\s*---\s*/gi);

    return (
      <div className="w-full space-y-1.5 text-xs">
        {sections.map((section, idx) => {
          const lines = section.split('\n');
          return (
            <React.Fragment key={idx}>
              {idx > 0 && (
                <div className="w-full my-3.5">
                  <hr className="w-full border-0 h-[1.5px] bg-gradient-to-r from-transparent via-cyan-400 to-transparent shadow-[0_0_8px_rgba(6,182,212,0.4)]" />
                </div>
              )}
              <div className="space-y-1 leading-relaxed">
                {lines.map((line, lIdx) => {
                  const trimmed = line.trim();
                  const isUrl = /^https?:\/\//i.test(trimmed);
                  if (isUrl) {
                    return (
                      <div key={lIdx} className="break-all py-0.5">
                        <a
                          href={trimmed}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-cyan-400 hover:text-cyan-300 underline font-mono text-[11px] inline-flex items-center gap-1 hover:opacity-90 transition-opacity"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <span>🔗</span>
                          <span>{trimmed}</span>
                        </a>
                      </div>
                    );
                  }
                  return (
                    <p key={lIdx} className="text-slate-200 font-medium">
                      {line || <span className="inline-block h-3" />}
                    </p>
                  );
                })}
              </div>
            </React.Fragment>
          );
        })}
      </div>
    );
  };

  // Icon state
  const [iconType, setIconType] = useState<'default' | 'upload' | 'url'>(
    editingLink.iconType || (editingLink.customIcon ? 'upload' : 'default')
  );
  const [iconUrl, setIconUrl] = useState<string>(
    editingLink.iconUrl || editingLink.customIcon || ''
  );
  const [customIcon, setCustomIcon] = useState<string>(
    editingLink.customIcon || editingLink.iconUrl || ''
  );

  // Icon method state inside ICON tab
  const [iconMethod, setIconMethod] = useState<'upload' | 'url'>('upload');
  const [urlInput, setUrlInput] = useState<string>(
    editingLink.iconType === 'url' ? (editingLink.iconUrl || editingLink.customIcon || '') : ''
  );

  // Validation & UI states
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [isTestingUrl, setIsTestingUrl] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadedFileDetails, setUploadedFileDetails] = useState<{ name: string; size: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Compute default website favicon
  const getDomain = (rawUrl: string) => {
    try {
      const normalizedUrl = rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`;
      return new URL(normalizedUrl).hostname;
    } catch {
      return '';
    }
  };

  const domain = getDomain(url || editingLink.url);
  const defaultFavicon = domain 
    ? `https://www.google.com/s2/favicons?domain=${domain}&sz=128` 
    : 'https://www.gstatic.com/images/branding/product/2x/googleg_48dp.png';

  // Get active preview image
  const getActivePreviewIcon = () => {
    if (iconType === 'default') {
      return defaultFavicon;
    }
    if (iconType === 'upload') {
      return customIcon || iconUrl || defaultFavicon;
    }
    if (iconType === 'url') {
      return iconUrl || customIcon || defaultFavicon;
    }
    return defaultFavicon;
  };

  const currentPreview = getActivePreviewIcon();

  // Validate and handle file upload
  const handleFileProcess = (file: File) => {
    setUploadError(null);

    // Validate type (PNG, JPG, JPEG, SVG, GIF)
    const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml', 'image/gif'];
    const ext = file.name.split('.').pop()?.toLowerCase();
    const validExts = ['png', 'jpg', 'jpeg', 'svg', 'gif'];

    if (!validTypes.includes(file.type) && (!ext || !validExts.includes(ext))) {
      setUploadError('Format file tidak didukung. Harap gunakan PNG, JPG, JPEG, SVG, atau GIF.');
      return;
    }

    // Max file size 2 MB (2,097,152 bytes)
    const MAX_SIZE = 2 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      setUploadError('Ukuran file melebihi batas 2 MB (Maks. 2 MB). Harap pilih gambar yang lebih kecil.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      if (result) {
        setIconType('upload');
        setCustomIcon(result);
        setIconUrl(result);

        const sizeFormatted = file.size < 1024 * 1024
          ? `${(file.size / 1024).toFixed(1)} KB`
          : `${(file.size / (1024 * 1024)).toFixed(2)} MB`;

        setUploadedFileDetails({
          name: file.name,
          size: sizeFormatted
        });
      }
    };
    reader.onerror = () => {
      setUploadError('Gagal membaca file dari perangkat.');
    };
    reader.readAsDataURL(file);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileProcess(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFileProcess(file);
    }
  };

  const handleRemoveUploadedFile = () => {
    setUploadedFileDetails(null);
    setUploadError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    // Revert to default
    setIconType('default');
    setCustomIcon('');
    setIconUrl('');
  };

  // Validate URL input
  const handleValidateUrl = (inputUrl: string) => {
    setUrlError(null);
    const trimmed = inputUrl.trim();
    if (!trimmed) {
      setUrlError(null);
      return;
    }

    let fullUrl = trimmed;
    if (!/^https?:\/\//i.test(fullUrl)) {
      fullUrl = 'https://' + fullUrl;
    }

    setIsTestingUrl(true);
    const img = new Image();
    img.onload = () => {
      setIsTestingUrl(false);
      setUrlError(null);
      setIconType('url');
      setIconUrl(fullUrl);
      setCustomIcon(fullUrl);
    };
    img.onerror = () => {
      setIsTestingUrl(false);
      setUrlError('Unable to load image. Please check the URL.');
    };
    img.src = fullUrl;
  };

  const handleResetToDefaultIcon = () => {
    setIconType('default');
    setIconUrl('');
    setCustomIcon('');
    setUploadedFileDetails(null);
    setUploadError(null);
    setUrlError(null);
    setUrlInput('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleCategoryInputChange = (val: string) => {
    setCategory(val);
    if (onCategoryChange) {
      onCategoryChange(val);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (urlError) {
      setActiveTab('ICON');
      return;
    }

    setIsSaving(true);
    try {
      const updatedLink: LinkItem = {
        ...editingLink,
        title: title.trim(),
        url: url.trim(),
        category: category.trim(),
        order: Number(order) || 1,
        notes: notes.trim(),
        iconType,
        iconUrl: iconType === 'default' ? '' : iconUrl,
        customIcon: iconType === 'default' ? '' : customIcon,
        updatedAt: Date.now()
      };

      await onSave(updatedLink);
    } catch (err) {
      console.error('Error saving shortcut:', err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-fade-in">
      <div className="glass-panel w-[95%] sm:w-[90%] max-w-[850px] rounded-2xl sm:rounded-3xl p-5 sm:p-7 shadow-[0_0_50px_rgba(0,210,238,0.25)] border border-cyan-500/30 relative overflow-hidden max-h-[92vh] flex flex-col bg-[#070c18]">
        
        {/* Header */}
        <div className="flex items-start justify-between pb-4 border-b border-white/10 shrink-0">
          <div>
            <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight uppercase flex items-center gap-2">
              <span>Edit Shortcut</span>
            </h2>
            <p className="text-[9px] font-black text-cyan-400 uppercase tracking-widest mt-0.5">
              Archive ID: {editingLink.id.slice(0, 8)}
            </p>
          </div>
          <button 
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-white/50 hover:text-white flex items-center justify-center transition-all text-sm font-bold border border-white/10"
            title="Tutup Modal"
          >
            ✕
          </button>
        </div>

        {/* Tab Navigation: GENERAL | ICON | ADVANCED */}
        <div className="flex items-center justify-between bg-[#0b1326] border border-cyan-500/30 rounded-xl p-1 my-4 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('GENERAL')}
            className={`flex-1 py-2 px-3 rounded-lg font-black text-[10px] sm:text-xs tracking-wider uppercase transition-all text-center ${
              activeTab === 'GENERAL'
                ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-400/60 shadow-[0_0_12px_rgba(0,210,238,0.3)]'
                : 'text-white/40 hover:text-white/80 hover:bg-white/5'
            }`}
          >
            GENERAL
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('ICON')}
            className={`flex-1 py-2 px-3 rounded-lg font-black text-[10px] sm:text-xs tracking-wider uppercase transition-all text-center flex items-center justify-center gap-1.5 ${
              activeTab === 'ICON'
                ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-400/60 shadow-[0_0_12px_rgba(0,210,238,0.3)]'
                : 'text-white/40 hover:text-white/80 hover:bg-white/5'
            }`}
          >
            <span>ICON</span>
            {iconType !== 'default' && (
              <span className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_6px_rgba(0,210,238,0.9)] animate-pulse" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('ADVANCED')}
            className={`flex-1 py-2 px-3 rounded-lg font-black text-[10px] sm:text-xs tracking-wider uppercase transition-all text-center ${
              activeTab === 'ADVANCED'
                ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-400/60 shadow-[0_0_12px_rgba(0,210,238,0.3)]'
                : 'text-white/40 hover:text-white/80 hover:bg-white/5'
            }`}
          >
            ADVANCED
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0 overflow-y-auto custom-scrollbar pr-1">
          
          {/* TAB 1: GENERAL */}
          {activeTab === 'GENERAL' && (
            <div className="space-y-4 py-1">
              <div>
                <label className="text-[9.5px] font-black text-white/50 uppercase tracking-widest block mb-1.5">
                  Identification (Nama Shortcut)
                </label>
                <input 
                  type="text" 
                  required 
                  value={title} 
                  onChange={(e) => setTitle(e.target.value)} 
                  className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs sm:text-sm font-bold focus:border-cyan-500 outline-none transition-all placeholder:text-white/20" 
                  placeholder="E.g. GOOGLE AI STUDIO"
                />
              </div>

              <div>
                <label className="text-[9.5px] font-black text-white/50 uppercase tracking-widest block mb-1.5">
                  Endpoint URL
                </label>
                <input 
                  type="text" 
                  inputMode="url" 
                  required 
                  value={url} 
                  onChange={(e) => setUrl(e.target.value)} 
                  className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs sm:text-sm font-bold focus:border-cyan-500 outline-none transition-all placeholder:text-white/20" 
                  placeholder="https://..."
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[9.5px] font-black text-white/50 uppercase tracking-widest block mb-1.5">
                    Category
                  </label>
                  <input 
                    type="text" 
                    list="category-list-edit"
                    value={category} 
                    onChange={(e) => handleCategoryInputChange(e.target.value.toUpperCase())} 
                    className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs sm:text-sm font-bold focus:border-cyan-500 outline-none transition-all uppercase placeholder:text-white/20" 
                    placeholder="AI TOOLS"
                  />
                  <datalist id="category-list-edit">
                    {existingCategories.map((cat, idx) => (
                      <option key={idx} value={cat} />
                    ))}
                  </datalist>
                </div>

                <div>
                  <label className="text-[9.5px] font-black text-white/50 uppercase tracking-widest block mb-1.5">
                    Priority Index
                  </label>
                  <input 
                    type="number" 
                    required 
                    min={1}
                    value={order} 
                    onChange={(e) => setOrder(parseInt(e.target.value) || 1)} 
                    className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs sm:text-sm font-bold focus:border-cyan-500 outline-none transition-all" 
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: ICON */}
          {activeTab === 'ICON' && (
            <div className="space-y-5 py-1">
              
              {/* SECTION A: CURRENT ICON */}
              <div className="bg-[#0b1326]/80 border border-cyan-500/30 rounded-2xl p-4 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] font-black uppercase tracking-wider text-cyan-400">
                    Current Icon
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full bg-cyan-500/15 border border-cyan-500/40 text-[9px] font-bold text-cyan-300 uppercase tracking-wide">
                    {iconType === 'default' ? 'Icon Default' : iconType === 'upload' ? 'Upload Gambar' : 'Image URL'}
                  </span>
                </div>

                <div className="flex items-center gap-4">
                  {/* Rounded-square preview container with futuristic cyan glow */}
                  <div className="w-18 h-18 sm:w-20 sm:h-20 rounded-2xl bg-[#080e1b] border border-cyan-400/60 flex items-center justify-center p-3 shadow-[0_0_20px_rgba(0,210,238,0.25)] shrink-0 relative group">
                    <img 
                      src={currentPreview} 
                      alt="Current Shortcut Icon" 
                      className="w-12 h-12 sm:w-14 sm:h-14 object-contain drop-shadow-[0_0_10px_rgba(0,210,238,0.35)]"
                      onError={(e) => {
                        const target = e.currentTarget;
                        target.src = 'https://www.gstatic.com/images/branding/product/2x/googleg_48dp.png';
                      }}
                    />
                  </div>

                  <div className="flex-1 min-w-0 space-y-2">
                    <p className="text-[11px] font-medium text-slate-300 leading-snug">
                      Icon ini akan tampil pada Shortcut Card di halaman utama.
                    </p>
                    
                    {iconType !== 'default' && (
                      <button
                        type="button"
                        onClick={handleResetToDefaultIcon}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/40 text-rose-300 text-[10px] font-bold uppercase tracking-wider transition-all"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                          <path d="M3 3v5h5" />
                        </svg>
                        <span>Reset ke Icon Default</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* SECTION B: CHANGE ICON */}
              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-white/60 block mb-2">
                  Change Icon
                </label>

                {/* Sub-tab selector: ① Upload Image | ② Image URL */}
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <button
                    type="button"
                    onClick={() => { setIconMethod('upload'); setUploadError(null); }}
                    className={`py-2 px-3 rounded-xl font-bold text-xs tracking-wide transition-all border text-center flex items-center justify-center gap-2 ${
                      iconMethod === 'upload'
                        ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 shadow-[0_0_10px_rgba(0,210,238,0.2)]'
                        : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <span>① Upload Image</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => { setIconMethod('url'); setUrlError(null); }}
                    className={`py-2 px-3 rounded-xl font-bold text-xs tracking-wide transition-all border text-center flex items-center justify-center gap-2 ${
                      iconMethod === 'url'
                        ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 shadow-[0_0_10px_rgba(0,210,238,0.2)]'
                        : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <span>② Image URL</span>
                  </button>
                </div>

                {/* METHOD ①: UPLOAD IMAGE */}
                {iconMethod === 'upload' && (
                  <div className="space-y-3">
                    {/* Hidden file input */}
                    <input 
                      type="file" 
                      ref={fileInputRef}
                      accept="image/png, image/jpeg, image/jpg, image/svg+xml, image/gif"
                      onChange={handleFileInputChange}
                      className="hidden" 
                    />

                    {/* Drag & Drop Zone or Selected File View */}
                    {!uploadedFileDetails && iconType !== 'upload' ? (
                      <div 
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        onClick={() => fileInputRef.current?.click()}
                        className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-2 ${
                          isDragging 
                            ? 'border-cyan-400 bg-cyan-500/20 shadow-[0_0_20px_rgba(0,210,238,0.3)] scale-[1.01]' 
                            : 'border-cyan-500/40 hover:border-cyan-400 bg-cyan-950/20 hover:bg-cyan-900/30'
                        }`}
                      >
                        <div className="w-10 h-10 rounded-full bg-cyan-500/20 border border-cyan-400/40 flex items-center justify-center text-cyan-400">
                          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                            <polyline points="17 8 12 3 7 8" />
                            <line x1="12" y1="3" x2="12" y2="15" />
                          </svg>
                        </div>
                        <div>
                          <p className="text-xs font-bold text-cyan-300">Drag & Drop your image here</p>
                          <p className="text-[10px] font-semibold text-slate-400 mt-0.5">
                            atau <span className="text-cyan-400 underline">Choose File</span> dari perangkat
                          </p>
                        </div>
                        <span className="text-[9px] text-white/40 font-mono mt-1">
                          PNG, JPG/JPEG, SVG, GIF (Maks. 2 MB)
                        </span>
                      </div>
                    ) : (
                      /* Active Upload File Details & Actions */
                      <div className="bg-[#080f20] border border-cyan-500/40 rounded-2xl p-4 flex items-center justify-between gap-3 shadow-inner">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-12 h-12 rounded-xl bg-[#030611] border border-cyan-400/50 flex items-center justify-center p-1.5 shrink-0 shadow-[0_0_10px_rgba(0,210,238,0.2)]">
                            <img 
                              src={customIcon || currentPreview} 
                              alt="Upload Preview" 
                              className="w-full h-full object-contain" 
                            />
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-white truncate">
                              {uploadedFileDetails?.name || 'File Upload Terpilih'}
                            </p>
                            {uploadedFileDetails?.size && (
                              <p className="text-[10px] font-semibold text-cyan-400 mt-0.5">
                                Ukuran: {uploadedFileDetails.size}
                              </p>
                            )}
                            <span className="inline-flex items-center gap-1 text-[9px] font-bold text-emerald-400 uppercase tracking-wider mt-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                              Ready for Save
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="px-3 py-1.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/50 text-cyan-300 text-[10px] font-black uppercase tracking-wider transition-all"
                          >
                            Replace
                          </button>
                          <button
                            type="button"
                            onClick={handleRemoveUploadedFile}
                            className="px-3 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/50 text-rose-300 text-[10px] font-black uppercase tracking-wider transition-all"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Upload Error Message */}
                    {uploadError && (
                      <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/50 text-rose-300 text-xs font-semibold flex items-center gap-2 animate-fade-in">
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-rose-400 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                        <span>{uploadError}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* METHOD ②: IMAGE URL */}
                {iconMethod === 'url' && (
                  <div className="space-y-3">
                    <div>
                      <label className="text-[9.5px] font-black text-white/50 uppercase tracking-widest block mb-1">
                        Image URL
                      </label>
                      <div className="relative flex items-center">
                        <input 
                          type="text" 
                          inputMode="url"
                          value={urlInput}
                          onChange={(e) => {
                            setUrlInput(e.target.value);
                            handleValidateUrl(e.target.value);
                          }}
                          placeholder="https://example.com/icon.png"
                          className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs sm:text-sm font-bold focus:border-cyan-500 outline-none transition-all placeholder:text-white/20 pr-10"
                        />
                        {isTestingUrl && (
                          <div className="absolute right-3 w-4 h-4 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                        )}
                      </div>
                    </div>

                    {/* Image URL Error Message (Exact Spec Requirement) */}
                    {urlError && (
                      <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/50 text-rose-300 text-xs font-semibold flex items-center gap-2 animate-fade-in">
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-rose-400 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                        <span>Unable to load image. Please check the URL.</span>
                      </div>
                    )}

                    {/* URL Image Success Preview */}
                    {!urlError && iconType === 'url' && iconUrl && (
                      <div className="bg-[#080f20] border border-cyan-500/40 rounded-2xl p-3 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-[#030611] border border-cyan-400/50 flex items-center justify-center p-1.5 shrink-0">
                          <img src={iconUrl} alt="URL Preview" className="w-full h-full object-contain" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-emerald-400">Gambar URL Berhasil Dimuat!</p>
                          <p className="text-[10px] text-slate-400 truncate font-mono">{iconUrl}</p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: ADVANCED */}
          {activeTab === 'ADVANCED' && (
            <div className="space-y-4 py-1">
              <div>
                {/* Header Action Bar */}
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <label className="text-[9.5px] font-black text-white/50 uppercase tracking-widest block">
                    Personal Notes (Catatan Tambahan)
                  </label>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {/* Tombol Sisipkan Garis Pemisah */}
                    <button
                      type="button"
                      onClick={handleInsertSeparator}
                      title="Sisipkan garis pemisah horizontal pada posisi kursor"
                      className="px-2.5 py-1 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 hover:text-cyan-300 border border-cyan-500/30 text-[10px] font-bold uppercase transition-all flex items-center gap-1 cursor-pointer shadow-[0_0_8px_rgba(6,182,212,0.15)] active:scale-95"
                    >
                      <span className="font-black text-xs">＋</span>
                      <span>Sisipkan Garis Pemisah</span>
                    </button>

                    {/* Tombol Salin Template */}
                    <button
                      type="button"
                      onClick={handleCopyTemplate}
                      title="Salin template kelompok link dengan pemisah horizontal"
                      className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 hover:text-white border border-white/10 text-[10px] font-bold uppercase transition-all flex items-center gap-1 cursor-pointer active:scale-95"
                    >
                      <span>📋</span>
                      <span>Salin Template</span>
                    </button>

                    {/* Toggle View Mode: Edit vs Rapi */}
                    <div className="flex items-center bg-white/5 p-0.5 rounded-lg border border-white/10 ml-0.5">
                      <button
                        type="button"
                        onClick={() => setNotesViewMode('EDIT')}
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase transition-all cursor-pointer ${
                          notesViewMode === 'EDIT'
                            ? 'bg-cyan-500 text-slate-950 shadow-sm'
                            : 'text-white/50 hover:text-white'
                        }`}
                        title="Mode Editor Teks"
                      >
                        ✏️ Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => setNotesViewMode('PREVIEW')}
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase transition-all cursor-pointer ${
                          notesViewMode === 'PREVIEW'
                            ? 'bg-cyan-500 text-slate-950 shadow-sm'
                            : 'text-white/50 hover:text-white'
                        }`}
                        title="Mode Tampilan Rapi (Render 100% Pemisah)"
                      >
                        👁️ Rapi
                      </button>
                    </div>
                  </div>
                </div>

                {/* Notifikasi Salin Template */}
                {copyNotice && (
                  <div className="mb-2 p-2 rounded-lg bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 text-[11px] font-bold flex items-center gap-1.5 animate-fade-in">
                    <span>✅</span>
                    <span>{copyNotice}</span>
                  </div>
                )}

                {/* Mode Editor vs Mode Rapi */}
                {notesViewMode === 'EDIT' ? (
                  <div className="space-y-3">
                    <textarea 
                      ref={notesTextareaRef}
                      placeholder="Tambah catatan konteks personal untuk shortcut ini... Klik '＋ Sisipkan Garis Pemisah' untuk membagi kelompok tulisan/link." 
                      value={notes} 
                      onChange={(e) => setNotes(e.target.value)} 
                      className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-xs sm:text-sm font-semibold focus:border-cyan-500 outline-none transition-all placeholder:text-white/20 min-h-[150px] sm:min-h-[180px] h-44 sm:h-52 resize-y custom-scrollbar font-mono leading-relaxed"
                    />

                    {/* Pratinjau Garis Pemisah Langsung (100% Width) */}
                    <div className="w-full p-4 bg-black/50 rounded-xl border border-cyan-500/25 min-h-[130px] max-h-60 sm:max-h-72 overflow-y-auto custom-scrollbar">
                      <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-white/5">
                        <span className="text-[10px] font-black uppercase tracking-wider text-cyan-400 flex items-center gap-1.5">
                          <span>👁️</span>
                          <span>Pratinjau Hasil (100% Width Separator)</span>
                        </span>
                        <span className="text-[9px] text-white/40 uppercase tracking-widest font-mono">
                          Live Render
                        </span>
                      </div>
                      {renderPersonalNotes(notes)}
                    </div>
                  </div>
                ) : (
                  /* Tampilan Bersih 100% Lebar Tanpa Kode Teknis */
                  <div className="w-full p-5 bg-black/50 rounded-xl border border-cyan-500/30 min-h-[260px] max-h-[420px] overflow-y-auto custom-scrollbar">
                    {renderPersonalNotes(notes)}
                  </div>
                )}
              </div>

              <div className="p-3 bg-white/5 rounded-xl border border-white/10 text-[10px] text-white/50 space-y-1">
                <p className="font-bold uppercase tracking-wider text-cyan-400">Metadata System</p>
                <p>Created At: {new Date(editingLink.createdAt).toLocaleString('id-ID')}</p>
                {editingLink.updatedAt && (
                  <p>Last Modified: {new Date(editingLink.updatedAt).toLocaleString('id-ID')}</p>
                )}
              </div>
            </div>
          )}

          {/* Action Footer Buttons */}
          <div className="flex items-center justify-between pt-5 mt-auto border-t border-white/10 shrink-0">
            <button 
              type="button" 
              onClick={onClose} 
              className="text-white/50 font-black text-[11px] uppercase tracking-wider hover:text-white transition-colors py-2 px-3"
            >
              Cancel
            </button>

            <button 
              type="submit" 
              disabled={isSaving || !!urlError}
              className="bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 font-black px-6 sm:px-8 py-2.5 rounded-xl text-xs uppercase tracking-wider shadow-[0_0_20px_rgba(0,210,238,0.4)] transition-all flex items-center gap-2"
            >
              {isSaving ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <span>Save Changes</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditModal;
