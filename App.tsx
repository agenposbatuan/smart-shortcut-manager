
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { LinkItem } from './types';
import * as storage from './services/storageService';
import { analyzeLink } from './services/geminiService';
import LinkCard from './components/LinkCard';
import { EditModal } from './components/EditModal';
import { cleanCategoryName, formatCategoryWithNumber, compareCategories } from './services/formatUtils';
import { exportToTxt, parseAndValidateTxtBackup, ParsedShortcutResult } from './services/backupUtils';
import BackupRestoreModal from './components/BackupRestoreModal';
import { isPinSessionActive, logoutPinSession } from './services/pinSecurityService';
import MasterPinLockModal from './components/MasterPinLockModal';
import MasterPinSettingsModal from './components/MasterPinSettingsModal';

const App: React.FC = () => {
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [editingLink, setEditingLink] = useState<LinkItem | null>(null);
  const [appUrlCopied, setAppUrlCopied] = useState(false);
  const [importReport, setImportReport] = useState<ParsedShortcutResult | null>(null);
  const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);
  const [backupModalInitialTab, setBackupModalInitialTab] = useState<'BACKUP' | 'RESTORE'>('BACKUP');
  const [isDataMenuOpen, setIsDataMenuOpen] = useState(false);
  
  // Master PIN Security States
  const [isUnlocked, setIsUnlocked] = useState<boolean>(() => isPinSessionActive());
  const [isSecuritySettingsOpen, setIsSecuritySettingsOpen] = useState(false);
  
  const [addForm, setAddForm] = useState({
    url: '',
    title: '',
    order: 1,
    category: '',
    notes: ''
  });
  
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Semua');
  const [viewMode, setViewMode] = useState('MEDIUM');
  const [sortBy, setSortBy] = useState<'MANUAL' | 'CLICKS' | 'RECENT'>('MANUAL');

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dataMenuRef = useRef<HTMLDivElement>(null);

  // Close data menu on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dataMenuRef.current && !dataMenuRef.current.contains(e.target as Node)) {
        setIsDataMenuOpen(false);
      }
    };
    if (isDataMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isDataMenuOpen]);

  // Stats calculation
  const stats = useMemo(() => {
    const total = links.length;
    const clicks = links.reduce((acc, curr) => acc + (curr.clicks || 0), 0);
    const pinned = links.filter(l => l.isPinned).length;
    const categories = new Set(links.map(l => l.category)).size;
    return { total, clicks, pinned, categories };
  }, [links]);

  const scrollCategories = (direction: 'left' | 'right') => {
    if (scrollContainerRef.current) {
      const scrollAmount = 200;
      scrollContainerRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
    }
  };

  const getGlobalSortedLinks = (currentLinks: LinkItem[]): LinkItem[] => {
    if (!currentLinks || currentLinks.length === 0) return [];

    const categoryFirstUsedMap = new Map<string, number>();
    currentLinks.forEach(link => {
      const catKey = cleanCategoryName(link.category || 'OTHER').toUpperCase().trim();
      const created = link.createdAt || 0;
      if (!categoryFirstUsedMap.has(catKey) || created < categoryFirstUsedMap.get(catKey)!) {
        categoryFirstUsedMap.set(catKey, created);
      }
    });

    const categoryGroups = new Map<string, LinkItem[]>();
    currentLinks.forEach(link => {
      const catKey = cleanCategoryName(link.category || 'OTHER').toUpperCase().trim();
      if (!categoryGroups.has(catKey)) {
        categoryGroups.set(catKey, []);
      }
      categoryGroups.get(catKey)!.push(link);
    });

    const sortedCategories = Array.from(categoryGroups.keys()).sort((catA, catB) => {
      const timeA = categoryFirstUsedMap.get(catA) ?? Number.MAX_SAFE_INTEGER;
      const timeB = categoryFirstUsedMap.get(catB) ?? Number.MAX_SAFE_INTEGER;
      return compareCategories(catA, catB, timeA, timeB);
    });

    const globalSorted: LinkItem[] = [];
    sortedCategories.forEach(catKey => {
      const catLinks = categoryGroups.get(catKey)!;
      catLinks.sort((a, b) => {
        const orderA = a.order || 0;
        const orderB = b.order || 0;
        if (orderA !== orderB) return orderA - orderB;
        return (a.createdAt || 0) - (b.createdAt || 0);
      });
      globalSorted.push(...catLinks);
    });

    return globalSorted;
  };

  const getSuggestedOrderForCategory = (category: string, currentLinks: LinkItem[]): number => {
    const catClean = cleanCategoryName(category || 'OTHER').toUpperCase().trim();
    const globalSorted = getGlobalSortedLinks(currentLinks);
    
    const matchingIndices: number[] = [];
    globalSorted.forEach((item, idx) => {
      if (cleanCategoryName(item.category || 'OTHER').toUpperCase().trim() === catClean) {
        matchingIndices.push(idx);
      }
    });

    if (matchingIndices.length > 0) {
      const lastIdx = matchingIndices[matchingIndices.length - 1];
      return lastIdx + 2;
    }

    return currentLinks.length + 1;
  };

  const autoFixOrders = async (currentLinks: LinkItem[]) => {
    const globalSorted = getGlobalSortedLinks(currentLinks);
    const updatesNeeded: LinkItem[] = [];

    globalSorted.forEach((link, idx) => {
      const expectedOrder = idx + 1;
      if (link.order !== expectedOrder) {
        updatesNeeded.push({ ...link, order: expectedOrder });
      }
    });

    if (updatesNeeded.length > 0) {
      for (const link of updatesNeeded) {
        await storage.updateLink(link);
      }
    }
  };

  const [subscriptionKey, setSubscriptionKey] = useState(0);

  useEffect(() => {
    if (!isUnlocked) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsubscribe = storage.subscribeToLinks(
      (updatedLinks) => {
        setLinks(updatedLinks);
        setLoading(false);
        setSyncError(null);
      },
      (err) => {
        console.error("Storage subscription error:", err);
        setLoading(false);
        let errorMsg = "Menghubungkan ke cloud database...";
        try {
          if (typeof err?.message === 'string') {
            const parsed = JSON.parse(err.message);
            if (parsed.error && parsed.error.includes("Missing or insufficient permissions")) {
              errorMsg = "Menghubungkan & mengautentikasi ke Firebase...";
            } else {
              errorMsg = parsed.error || err.message;
            }
          }
        } catch {
          errorMsg = err?.message || "Koneksi penyimpanan bermasalah.";
        }
        setSyncError(errorMsg);
      }
    );
    return () => unsubscribe();
  }, [subscriptionKey, isUnlocked]);

  const openAddModal = () => {
    const defaultCat = (selectedCategory !== 'Semua' && selectedCategory !== 'Sering Dipakai' && selectedCategory !== 'Favorit' && selectedCategory !== 'Baru Saja Dibuat') 
      ? selectedCategory 
      : '';
    const suggestedOrder = getSuggestedOrderForCategory(defaultCat, links);
    setAddForm({
      url: '',
      title: '',
      category: defaultCat,
      order: suggestedOrder,
      notes: ''
    });
    setIsAdding(true);
  };

  const handleCategoryChangeInAdd = (newCat: string) => {
    const suggestedOrder = getSuggestedOrderForCategory(newCat, links);
    setAddForm(prev => ({
      ...prev,
      category: newCat,
      order: suggestedOrder
    }));
  };

  const handleMagicFill = async () => {
    if (!addForm.url) return;
    setIsAnalyzing(true);
    try {
      const analysis = await analyzeLink(addForm.url);
      const cat = analysis.category.toUpperCase().trim();
      const suggestedOrder = getSuggestedOrderForCategory(cat, links);
      setAddForm(prev => ({
        ...prev,
        title: analysis.title,
        category: cat,
        order: suggestedOrder
      }));
    } catch (err) {
      console.error(err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const generateUUID = (): string => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      try {
        return crypto.randomUUID();
      } catch {
        // Fallback if crypto.randomUUID fails in restricted iframe context
      }
    }
    return Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 9);
  };

  const handleAddLink = async (e: React.FormEvent) => {
    e.preventDefault();
    let rawUrl = (addForm.url || '').trim();
    if (!rawUrl) return;

    if (!/^https?:\/\//i.test(rawUrl)) {
      rawUrl = 'https://' + rawUrl;
    }

    let finalTitle = (addForm.title || '').trim();
    if (!finalTitle) {
      try {
        const parsed = new URL(rawUrl);
        finalTitle = parsed.hostname.replace(/^www\./i, '').toUpperCase();
      } catch {
        finalTitle = rawUrl.toUpperCase();
      }
    }

    try {
      const now = Date.now();
      const targetCategory = (addForm.category || 'OTHER').toUpperCase().trim();
      
      const newLink: LinkItem = {
        id: generateUUID(),
        url: rawUrl,
        title: finalTitle,
        description: '', 
        category: targetCategory,
        tags: [],
        createdAt: now,
        updatedAt: now,
        order: addForm.order || 1,
        clicks: 0,
        isPinned: false,
        notes: addForm.notes || ''
      };

      const globalSorted = getGlobalSortedLinks(links);
      const requestedOrder = addForm.order || (globalSorted.length + 1);
      const targetIndex = Math.max(0, Math.min(requestedOrder - 1, globalSorted.length));

      globalSorted.splice(targetIndex, 0, newLink);

      const itemsToUpdate: LinkItem[] = [];
      globalSorted.forEach((item, index) => {
        const expectedOrder = index + 1;
        if (item.id === newLink.id) {
          newLink.order = expectedOrder;
        } else if (item.order !== expectedOrder) {
          itemsToUpdate.push({ ...item, order: expectedOrder });
        }
      });

      // Close modal and reset form immediately for snappy user experience
      setAddForm({ url: '', title: '', order: 1, category: '', notes: '' });
      setIsAdding(false);

      // Save to storage
      await storage.saveLink(newLink);

      for (const item of itemsToUpdate) {
        await storage.updateLink(item);
      }
    } catch (err) {
      console.error("Error in handleAddLink:", err);
      alert("Gagal menyimpan shortcut: " + (err instanceof Error ? err.message : String(err)));
    }
  };

  const handleCategoryChangeInEdit = (newCat: string) => {
    if (!editingLink) return;
    const newCatUpper = newCat.toUpperCase().trim();
    const originalLink = links.find(l => l.id === editingLink.id);
    const oldCatUpper = (originalLink?.category || '').toUpperCase().trim();
    
    if (newCatUpper !== oldCatUpper) {
      const remainingLinks = links.filter(l => l.id !== editingLink.id);
      const suggestedOrder = getSuggestedOrderForCategory(newCat, remainingLinks);
      setEditingLink({
        ...editingLink,
        category: newCat,
        order: suggestedOrder
      });
    } else {
      setEditingLink({
        ...editingLink,
        category: newCat
      });
    }
  };

  const handleSaveEditedLink = async (targetLink: LinkItem) => {
    let rawUrl = targetLink.url.trim();
    if (!rawUrl) return;

    if (!/^https?:\/\//i.test(rawUrl)) {
      rawUrl = 'https://' + rawUrl;
    }

    let finalTitle = targetLink.title.trim();
    if (!finalTitle) {
      try {
        const parsed = new URL(rawUrl);
        finalTitle = parsed.hostname.replace(/^www\./i, '').toUpperCase();
      } catch {
        finalTitle = rawUrl.toUpperCase();
      }
    }

    try {
      const originalLink = links.find(l => l.id === targetLink.id);
      const now = Date.now();
      const newCat = (targetLink.category || 'OTHER').toUpperCase().trim();
      const oldCat = (originalLink?.category || 'OTHER').toUpperCase().trim();

      const newCatExists = links.some(l => l.id !== targetLink.id && (l.category || 'OTHER').toUpperCase().trim() === newCat);
      const updatedCreatedAt = (oldCat !== newCat && !newCatExists) ? now : (targetLink.createdAt || now);

      const updatedLink: LinkItem = {
        ...targetLink,
        url: rawUrl,
        title: finalTitle,
        category: newCat,
        createdAt: updatedCreatedAt,
        updatedAt: now
      };

      const remainingLinks = links.filter(l => l.id !== targetLink.id);
      const globalSorted = getGlobalSortedLinks(remainingLinks);

      const requestedOrder = targetLink.order || (globalSorted.length + 1);
      const targetIndex = Math.max(0, Math.min(requestedOrder - 1, globalSorted.length));

      globalSorted.splice(targetIndex, 0, updatedLink);

      for (let i = 0; i < globalSorted.length; i++) {
        const expectedOrder = i + 1;
        const item = globalSorted[i];
        if (item.id === updatedLink.id) {
          await storage.updateLink({ ...updatedLink, order: expectedOrder });
        } else if (item.order !== expectedOrder) {
          await storage.updateLink({ ...item, order: expectedOrder });
        }
      }

      setEditingLink(null);
    } catch (err) {
      console.error(err);
      alert("Gagal memperbarui link.");
    }
  };

  const handleTogglePin = async (link: LinkItem) => {
    await storage.updateLink({ ...link, isPinned: !link.isPinned, updatedAt: Date.now() });
  };

  const handleLinkClick = async (link: LinkItem) => {
    await storage.updateLink({ ...link, clicks: (link.clicks || 0) + 1 });
  };

  const handleCopyAppUrl = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      await navigator.clipboard.writeText(window.location.href);
      setAppUrlCopied(true);
      setTimeout(() => setAppUrlCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy app URL', err);
    }
  };

  const handleExportTxt = () => {
    const txtContent = exportToTxt(links);
    const blob = new Blob([txtContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const exportFileName = `sevenproject_backup_${new Date().toISOString().split('T')[0]}.txt`;
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', url);
    linkElement.setAttribute('download', exportFileName);
    document.body.appendChild(linkElement);
    linkElement.click();
    document.body.removeChild(linkElement);
    URL.revokeObjectURL(url);
  };

  const handleExportJson = () => {
    const dataStr = JSON.stringify(links, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const exportFileName = `sevenproject_backup_${new Date().toISOString().split('T')[0]}.json`;
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', url);
    linkElement.setAttribute('download', exportFileName);
    document.body.appendChild(linkElement);
    linkElement.click();
    document.body.removeChild(linkElement);
    URL.revokeObjectURL(url);
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const fileText = event.target?.result as string || '';
        const report = parseAndValidateTxtBackup(fileText);

        if (report.totalProcessed === 0) {
          alert("File backup tidak memiliki data shortcut yang valid atau kosong.");
          return;
        }

        if (report.validItems.length > 0) {
          for (const item of report.validItems) {
            await storage.saveLink(item);
          }
        }

        setImportReport(report);
      } catch (err) {
        console.error("Error reading import file:", err);
        alert("Gagal membaca file backup.");
      } finally {
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    };
    reader.readAsText(file, 'UTF-8');
  };

  const categoryFirstUsedMap = useMemo(() => {
    const map = new Map<string, number>();
    links.forEach(l => {
      const catKey = (l.category || 'OTHER').toUpperCase().trim();
      const created = l.createdAt || 0;
      if (!map.has(catKey) || created < map.get(catKey)!) {
        map.set(catKey, created);
      }
    });
    return map;
  }, [links]);

  const existingCategories = useMemo(() => {
    const catMap = new Map<string, { displayCat: string; firstUsed: number }>();
    links.forEach(l => {
      const key = cleanCategoryName(l.category || 'OTHER').toUpperCase().trim();
      const created = l.createdAt || 0;
      if (!catMap.has(key)) {
        catMap.set(key, { displayCat: l.category || 'OTHER', firstUsed: created });
      } else {
        const current = catMap.get(key)!;
        if (created < current.firstUsed) {
          current.firstUsed = created;
        }
      }
    });

    const sortedList = Array.from(catMap.values())
      .sort((a, b) => compareCategories(a.displayCat, b.displayCat, a.firstUsed, b.firstUsed));

    return sortedList.map((item, idx) => formatCategoryWithNumber(item.displayCat, idx));
  }, [links]);

  const categoryDisplayMap = useMemo(() => {
    const map = new Map<string, string>();
    existingCategories.forEach(cat => {
      map.set(cleanCategoryName(cat).toUpperCase(), cat);
    });
    return map;
  }, [existingCategories]);

  const categories: string[] = ['Semua', 'Sering Dipakai', 'Favorit', 'Baru Saja Dibuat', ...existingCategories];

  let displayLinks = [...links].filter(link => {
    const matchesSearch = 
      link.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
      link.url.toLowerCase().includes(searchQuery.toLowerCase()) ||
      link.category.toLowerCase().includes(searchQuery.toLowerCase());
    
    if (!matchesSearch) return false;

    // Logic: If 'Sering Dipakai' is selected, show only shortcuts that have usage hits
    if (selectedCategory === 'Sering Dipakai') {
      return (link.clicks || 0) > 0;
    }

    // Logic: If 'Favorit' is selected, show only pinned.
    if (selectedCategory === 'Favorit') {
      return link.isPinned;
    }

    // Otherwise, show the link if it's in the category (or it's 'Semua'/'Baru Saja Dibuat')
    if (selectedCategory === 'Semua' || selectedCategory === 'Baru Saja Dibuat') {
      return true;
    }
    
    const selCat = (selectedCategory || '').toUpperCase().trim();
    const linkCat = (link.category || 'OTHER').toUpperCase().trim();
    const selClean = cleanCategoryName(selectedCategory).toUpperCase().trim();
    const linkClean = cleanCategoryName(link.category || '').toUpperCase().trim();

    return linkCat === selCat || linkClean === selClean;
  });

  // Updated sorting logic: First Category Used Order -> Category -> Priority Index (order) -> createdAt
  displayLinks.sort((a, b) => {
    if (selectedCategory === 'Sering Dipakai') {
      const clicksDiff = (b.clicks || 0) - (a.clicks || 0);
      if (clicksDiff !== 0) return clicksDiff;
      const orderA = a.order || 0;
      const orderB = b.order || 0;
      if (orderA !== orderB) return orderA - orderB;
      return (a.createdAt || 0) - (b.createdAt || 0);
    }

    if (sortBy === 'CLICKS') return (b.clicks || 0) - (a.clicks || 0);
    if (sortBy === 'RECENT' || selectedCategory === 'Baru Saja Dibuat') {
      return (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt);
    }
    
    // Default MANUAL:
    const cleanA = cleanCategoryName(a.category || 'OTHER').toUpperCase().trim();
    const cleanB = cleanCategoryName(b.category || 'OTHER').toUpperCase().trim();

    if (cleanA !== cleanB) {
      const firstUsedA = categoryFirstUsedMap.get(cleanA) ?? Number.MAX_SAFE_INTEGER;
      const firstUsedB = categoryFirstUsedMap.get(cleanB) ?? Number.MAX_SAFE_INTEGER;
      const catCmp = compareCategories(a.category || '', b.category || '', firstUsedA, firstUsedB);
      if (catCmp !== 0) return catCmp;
    }

    // Priority Index (order) inside category
    const orderA = a.order || 0;
    const orderB = b.order || 0;
    if (orderA !== orderB) {
      return orderA - orderB;
    }

    // 3. createdAt
    return (a.createdAt || 0) - (b.createdAt || 0);
  });

  const getGridClass = () => {
    switch (viewMode) {
      case 'SMALL': return 'grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-1.5 sm:gap-3 transition-all duration-300 ease-in-out';
      case 'TILES': return 'grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-1.5 sm:gap-3.5 transition-all duration-300 ease-in-out';
      case 'MEDIUM': return 'grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-3.5 transition-all duration-300 ease-in-out';
      case 'LIST': return 'flex flex-col gap-2 sm:gap-2.5 transition-all duration-300 ease-in-out';
      default: return 'grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-1.5 sm:gap-3.5 transition-all duration-300 ease-in-out';
    }
  };

  // Jika aplikasi belum di-unlock dengan Master PIN, tampilkan layar kunci Master PIN
  if (!isUnlocked) {
    return (
      <div className="min-h-screen bg-[#05070a] text-white flex flex-col justify-center items-center p-4 relative overflow-hidden">
        <div className="fixed inset-0 glow-overlay pointer-events-none"></div>
        <MasterPinLockModal onUnlocked={() => setIsUnlocked(true)} />
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-12 sm:pb-20 max-w-7xl mx-auto px-2.5 sm:px-6 lg:px-8">
      {/* Navigation */}
      <nav className="py-2.5 sm:py-3 flex justify-between items-center border-b border-white/5 mb-2.5 sm:mb-3.5">
        <div className="flex items-center gap-2 sm:gap-2.5">
          <div className="w-7 h-7 sm:w-8 sm:h-8 bg-cyan-500 rounded-lg flex items-center justify-center text-white font-black text-base shadow-[0_2px_10px_rgba(6,182,212,0.4)] shrink-0">
            S
          </div>
          <div className="flex flex-col">
            <span className="font-extrabold text-xs sm:text-sm tracking-tight uppercase leading-none">SevenProject</span>
            <span className="text-[7px] font-black text-cyan-500/60 uppercase tracking-[0.2em]">Vault OS</span>
          </div>
        </div>
        
        <div className="flex gap-1.5 items-center">
          <div className="hidden sm:flex items-center gap-2.5 mr-2 px-2.5 py-1 rounded-full bg-white/5 border border-white/5">
            <div className="flex flex-col items-center">
              <span className="text-[7px] font-black text-white/30 uppercase">Links</span>
              <span className="text-xs font-bold">{stats.total}</span>
            </div>
            <div className="w-px h-4 bg-white/10"></div>
            <div className="flex flex-col items-center">
              <span className="text-[7px] font-black text-white/30 uppercase">Hits</span>
              <span className="text-xs font-bold text-cyan-400">{stats.clicks}</span>
            </div>
          </div>
          
          <button 
            onClick={() => handleCopyAppUrl()} 
            title="Copy Vault Link" 
            className={`p-1.5 rounded-lg transition-all flex items-center gap-1 ${appUrlCopied ? 'bg-green-500 text-white' : 'bg-white/5 text-white/40 hover:text-cyan-400 hover:bg-white/10'}`}
          >
            {appUrlCopied ? (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
            )}
            {appUrlCopied && <span className="text-[8px] font-black uppercase pr-0.5">Copied</span>}
          </button>

          {/* Centralized DATA Menu (Backup JSON, Restore JSON, Export TXT, Import JSON) */}
          <div className="relative" ref={dataMenuRef}>
            <button 
              onClick={() => setIsDataMenuOpen(!isDataMenuOpen)} 
              title="Pusat Manajemen Data (Backup, Restore, Export, Import)" 
              className={`px-2.5 py-1.5 rounded-lg transition-all flex items-center gap-1.5 text-[10px] font-black uppercase shrink-0 border cursor-pointer ${
                isDataMenuOpen 
                  ? 'bg-cyan-500 text-slate-950 border-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.4)]' 
                  : 'bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20 hover:text-cyan-200 border-cyan-500/30 shadow-[0_0_12px_rgba(6,182,212,0.15)]'
              }`}
            >
              <span>📦</span>
              <span>DATA</span>
              <svg xmlns="http://www.w3.org/2000/svg" className={`h-3 w-3 transition-transform duration-200 ${isDataMenuOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {isDataMenuOpen && (
              <div className="absolute right-0 top-full mt-2 w-56 bg-[#0c121e] border border-cyan-500/30 rounded-2xl shadow-[0_10px_30px_rgba(0,0,0,0.85)] p-1.5 z-50 animate-fade-scale backdrop-blur-xl">
                <div className="px-3 py-2 border-b border-white/5 mb-1">
                  <p className="text-[9px] font-black uppercase text-cyan-400 tracking-wider">Manajemen Data</p>
                  <p className="text-[10px] text-white/50">Cadangkan, pulihkan, & transfer</p>
                </div>

                <button
                  onClick={() => {
                    setBackupModalInitialTab('BACKUP');
                    setIsBackupModalOpen(true);
                    setIsDataMenuOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 rounded-xl text-xs font-bold text-slate-200 hover:bg-cyan-500/15 hover:text-cyan-300 transition-colors flex items-center gap-2.5 cursor-pointer group"
                >
                  <span className="text-base p-1 rounded-lg bg-cyan-500/10 border border-cyan-500/20 group-hover:border-cyan-500/40">📦</span>
                  <div className="flex-1 min-w-0">
                    <p className="leading-tight font-black text-[11px] uppercase">Backup JSON</p>
                    <p className="text-[9px] text-white/40 font-normal truncate">Cadangkan 100% data lengkap</p>
                  </div>
                </button>

                <button
                  onClick={() => {
                    setBackupModalInitialTab('RESTORE');
                    setIsBackupModalOpen(true);
                    setIsDataMenuOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 rounded-xl text-xs font-bold text-slate-200 hover:bg-amber-500/15 hover:text-amber-300 transition-colors flex items-center gap-2.5 cursor-pointer group"
                >
                  <span className="text-base p-1 rounded-lg bg-amber-500/10 border border-amber-500/20 group-hover:border-amber-500/40">📥</span>
                  <div className="flex-1 min-w-0">
                    <p className="leading-tight font-black text-[11px] uppercase">Restore JSON</p>
                    <p className="text-[9px] text-white/40 font-normal truncate">Pulihkan & validasi integritas</p>
                  </div>
                </button>

                <div className="my-1 border-t border-white/5"></div>

                <button
                  onClick={() => {
                    handleExportTxt();
                    setIsDataMenuOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 rounded-xl text-xs font-bold text-slate-200 hover:bg-white/10 hover:text-white transition-colors flex items-center gap-2.5 cursor-pointer group"
                >
                  <span className="text-base p-1 rounded-lg bg-white/5 border border-white/10 group-hover:border-white/20">📄</span>
                  <div className="flex-1 min-w-0">
                    <p className="leading-tight font-black text-[11px] uppercase">Export TXT</p>
                    <p className="text-[9px] text-white/40 font-normal truncate">Unduh berkas format teks</p>
                  </div>
                </button>

                <button
                  onClick={() => {
                    fileInputRef.current?.click();
                    setIsDataMenuOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 rounded-xl text-xs font-bold text-slate-200 hover:bg-white/10 hover:text-white transition-colors flex items-center gap-2.5 cursor-pointer group"
                >
                  <span className="text-base p-1 rounded-lg bg-white/5 border border-white/10 group-hover:border-white/20">📂</span>
                  <div className="flex-1 min-w-0">
                    <p className="leading-tight font-black text-[11px] uppercase">Import JSON / TXT</p>
                    <p className="text-[9px] text-white/40 font-normal truncate">Impor dari berkas (.json / .txt)</p>
                  </div>
                </button>
              </div>
            )}
          </div>
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleImport} 
            className="hidden" 
            accept=".txt,.json,text/plain,application/json" 
          />

          {/* Master PIN & Security Buttons */}
          <button 
            onClick={() => setIsSecuritySettingsOpen(true)} 
            title="Pengaturan Keamanan Master PIN & Recovery Keyword" 
            className="px-2 py-1.5 rounded-lg bg-white/5 text-white/70 hover:text-cyan-400 hover:bg-white/10 transition-all flex items-center gap-1 text-[10px] font-bold uppercase shrink-0 border border-white/5 cursor-pointer"
          >
            <span>🛡️</span>
            <span className="hidden md:inline">PIN</span>
          </button>

          <button 
            onClick={() => {
              logoutPinSession();
              setIsUnlocked(false);
            }} 
            title="Kunci Aplikasi Sekarang" 
            className="px-2 py-1.5 rounded-lg bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 transition-all flex items-center gap-1 text-[10px] font-bold uppercase shrink-0 border border-rose-500/20 cursor-pointer"
          >
            <span>🔒</span>
            <span className="hidden md:inline">Lock</span>
          </button>
        </div>
      </nav>

      {/* Hero Section - Compact */}
      <div className="text-center mb-3 sm:mb-4 px-2">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-[8px] sm:text-[9px] font-black uppercase tracking-wider mb-2">
          {syncError ? (
            <button
              onClick={() => {
                setSyncError(null);
                setSubscriptionKey(prev => prev + 1);
              }}
              className="flex items-center gap-1.5 cursor-pointer hover:opacity-80 transition-opacity"
              title="Klik untuk mencoba menghubungkan kembali"
            >
              <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0"></div>
              <span className="text-amber-300">{syncError}</span>
              <span className="text-[8px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded ml-1 font-bold">Coba Lagi ↺</span>
            </button>
          ) : (
            <>
              <div className="w-2 h-2 rounded-full bg-cyan-400 status-lamp-online shrink-0"></div>
              <span className="text-cyan-400">PENYIMPANAN FIREBASE CLOUD VAULT (REALTIME)</span>
            </>
          )}
        </div>
        
        <div className="relative inline-block mb-1">
          <h1 className="text-2xl sm:text-4xl md:text-5xl font-black tracking-tighter leading-tight uppercase flex items-center justify-center gap-2 flex-wrap">
            <span className="text-white">Smart</span>
            <span className="bg-gradient-to-r from-cyan-400 to-blue-600 px-2.5 py-0.5 rounded-lg text-white -rotate-1">Shortcuts.</span>
          </h1>
        </div>

        <p className="text-white/40 max-w-md mx-auto text-[9px] sm:text-[11px] font-semibold uppercase tracking-tight">
          Intelligent bookmark management with AI-powered categorization and real-time synchronization.
        </p>
      </div>

      {/* Sticky Search & Options Toolbar */}
      <div className="max-w-4xl mx-auto mb-3 sm:mb-5 sticky top-2 sm:top-4 z-40">
        <div className="glass-panel rounded-2xl p-1.5 sm:p-2 flex items-center shadow-xl shadow-black/40 border-white/10 gap-1.5 sm:gap-2">
          <div className="flex-1 flex items-center gap-2 pl-3 pr-1 min-w-0">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-white/30 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input 
              type="text" 
              placeholder="Search shortcuts or categories..."
              className="bg-transparent border-none outline-none w-full text-xs sm:text-sm font-bold text-white placeholder:text-white/20 uppercase tracking-tight py-1 min-w-0"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          
          <div className="flex items-center gap-1.5 sm:gap-3 border-l border-white/10 px-1.5 sm:px-3 shrink-0">
             <div className="flex flex-col">
               <span className="text-[7px] font-black text-white/30 uppercase">Layout</span>
               <select 
                  value={viewMode}
                  onChange={(e) => setViewMode(e.target.value)}
                  className="bg-transparent text-[9px] sm:text-[10px] font-black text-cyan-400 outline-none cursor-pointer appearance-none uppercase hover:text-cyan-300 transition-colors"
                >
                  <option value="MEDIUM" className="bg-slate-950">Standard</option>
                  <option value="SMALL" className="bg-slate-950">Compact</option>
                  <option value="TILES" className="bg-slate-950">Tiles</option>
                  <option value="LIST" className="bg-slate-950">List</option>
                </select>
             </div>
             <div className="flex flex-col border-l border-white/10 pl-1.5 sm:pl-3">
               <span className="text-[7px] font-black text-white/30 uppercase">Order</span>
               <select 
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="bg-transparent text-[9px] sm:text-[10px] font-black text-cyan-400 outline-none cursor-pointer appearance-none uppercase hover:text-cyan-300 transition-colors"
                >
                  <option value="MANUAL" className="bg-slate-950">Manual</option>
                  <option value="RECENT" className="bg-slate-950">Recent</option>
                  <option value="CLICKS" className="bg-slate-950">Popular</option>
                </select>
             </div>
          </div>

          <button 
            onClick={openAddModal}
            className="px-3.5 sm:px-6 py-2 sm:py-2.5 rounded-xl bg-cyan-500 text-white font-black text-xs tracking-wider flex items-center justify-center gap-1 hover:bg-cyan-400 transition-all active:scale-95 uppercase shadow-[0_4px_15px_rgba(6,182,212,0.3)] shrink-0"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
            </svg>
            <span className="hidden xs:inline">Add</span>
          </button>
        </div>
      </div>
      
      {/* Category Filter Scroll */}
      <div className="max-w-5xl mx-auto mb-3 sm:mb-5 relative">
        <div className="flex items-center gap-1.5">
          <button 
            onClick={() => scrollCategories('left')}
            className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-all shrink-0"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          <div 
            ref={scrollContainerRef}
            className="flex-1 overflow-x-auto no-scrollbar flex items-center gap-1.5 category-container py-1"
          >
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-xl text-[9px] sm:text-[10px] font-black tracking-wider whitespace-nowrap transition-all uppercase border ${
                  selectedCategory === cat 
                    ? 'bg-cyan-500 text-white border-cyan-500 shadow-md shadow-cyan-500/20' 
                    : 'bg-white/5 text-white/40 border-transparent hover:border-white/10 hover:text-white'
                }`}
              >
                {cat === 'Semua' ? '( ALL )' : cat === 'Sering Dipakai' ? '🔥 SERING DIPAKAI' : cat === 'Favorit' ? '⭐ FAVORITES' : cat === 'Baru Saja Dibuat' ? '🕒 RECENT' : cat}
              </button>
            ))}
          </div>

          <button 
            onClick={() => scrollCategories('right')}
            className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-all shrink-0"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Grid Content */}
      <div className="w-full">
        {loading ? (
          <div className={getGridClass()}>
            {[1,2,3,4,5,6,7,8].map(i => <div key={i} className="h-48 rounded-2xl glass-panel animate-pulse bg-white/5"></div>)}
          </div>
        ) : displayLinks.length > 0 ? (
          <div className={getGridClass()}>
            {displayLinks.map(link => (
              <LinkCard 
                key={`${viewMode}-${link.id}`} 
                link={link} 
                viewMode={viewMode}
                isDarkMode={true}
                categoryName={categoryDisplayMap.get(cleanCategoryName(link.category).toUpperCase())}
                onDelete={storage.deleteLink} 
                onEdit={() => setEditingLink(link)}
                onTogglePin={handleTogglePin}
                onLinkClick={handleLinkClick}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-20 rounded-2xl border border-dashed border-white/10 glass-panel">
            <div className="w-14 h-14 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4 text-white/20">
               <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
               </svg>
            </div>
            <p className="text-white/30 font-black text-xs uppercase tracking-widest">
              {selectedCategory === 'Sering Dipakai' 
                ? 'Belum ada shortcut yang sering dipakai' 
                : 'No shortcuts found in this sector'}
            </p>
          </div>
        )}
      </div>

      {/* Mobile Floating Action Button */}
      <div className="fixed bottom-5 right-5 z-50 sm:hidden">
        <button 
          onClick={openAddModal}
          className="w-12 h-12 rounded-full bg-cyan-500 text-white flex items-center justify-center shadow-lg shadow-cyan-500/40 active:scale-90 transition-transform"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>

      <datalist id="category-list">
        {existingCategories.map(cat => (
          <option key={cat} value={cat} />
        ))}
      </datalist>

      {/* Add Modal */}
      {isAdding && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md">
          <div className="glass-panel w-full max-w-lg rounded-2xl p-5 sm:p-7 shadow-2xl border-white/10 relative overflow-hidden max-h-[90vh] overflow-y-auto">
            <div className="absolute top-0 left-0 w-48 h-48 bg-cyan-500/10 blur-[80px] -translate-x-1/2 -translate-y-1/2 pointer-events-none"></div>
            
            <div className="relative z-10">
              <h2 className="text-xl sm:text-2xl font-black mb-0.5 tracking-tight uppercase">Initialize Node</h2>
              <p className="text-[9px] font-black text-white/30 uppercase tracking-widest mb-4 sm:mb-6">Vault Registry System</p>
              
              <form onSubmit={handleAddLink}>
                <div className="space-y-3 sm:space-y-4">
                  <div>
                    <label className="text-[9px] font-black text-white/40 uppercase tracking-widest block mb-1">Endpoint URL</label>
                    <div className="flex gap-2">
                      <input 
                        type="text" 
                        inputMode="url"
                        required 
                        placeholder="example.com or https://..." 
                        value={addForm.url} 
                        onChange={(e) => setAddForm({...addForm, url: e.target.value})} 
                        className="flex-1 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs sm:text-sm font-bold focus:border-cyan-500 outline-none transition-all placeholder:text-white/20" 
                      />
                      <button 
                        type="button"
                        disabled={!addForm.url || isAnalyzing}
                        onClick={handleMagicFill}
                        className={`px-3.5 rounded-xl flex items-center justify-center transition-all ${isAnalyzing ? 'bg-purple-500/50 cursor-not-allowed' : 'bg-gradient-to-tr from-purple-500 to-pink-500 hover:scale-105 active:scale-95 text-white'}`}
                        title="AI Auto-Fill"
                      >
                        {isAnalyzing ? (
                          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                        ) : (
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M11.3 1.047a1 1 0 01.897.487l1.393 2.455 2.801.407a1 1 0 01.554 1.705l-2.027 1.975.479 2.79a1 1 0 01-1.45 1.054l-2.503-1.316-2.503 1.317a1 1 0 01-1.45-1.054l.479-2.79-2.028-1.975a1 1 0 01.554-1.705l2.801-.407 1.393-2.455a1 1 0 01.897-.487z" clipRule="evenodd" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="text-[9px] font-black text-white/40 uppercase tracking-widest block mb-1">Identification</label>
                    <input type="text" placeholder="Display Title (Otomatis jika kosong)" value={addForm.title} onChange={(e) => setAddForm({...addForm, title: e.target.value})} className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs sm:text-sm font-bold focus:border-cyan-500 outline-none transition-all placeholder:text-white/20" />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[9px] font-black text-white/40 uppercase tracking-widest block mb-1">Category</label>
                      <input 
                        type="text" 
                        placeholder="GENERAL" 
                        list="category-list"
                        value={addForm.category} 
                        onChange={(e) => handleCategoryChangeInAdd(e.target.value.toUpperCase())} 
                        className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs sm:text-sm font-bold focus:border-cyan-500 outline-none transition-all uppercase placeholder:text-white/20" 
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-black text-white/40 uppercase tracking-widest block mb-1">Priority Index</label>
                      <input type="number" required value={addForm.order} onChange={(e) => setAddForm({...addForm, order: parseInt(e.target.value) || 1})} className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs sm:text-sm font-bold focus:border-cyan-500 outline-none transition-all" />
                    </div>
                  </div>

                  <div>
                    <label className="text-[9px] font-black text-white/40 uppercase tracking-widest block mb-1">Personal Notes (Catatan)</label>
                    <textarea 
                      placeholder="Add specific context for this node..." 
                      value={addForm.notes} 
                      onChange={(e) => setAddForm({...addForm, notes: e.target.value})} 
                      className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs font-semibold focus:border-cyan-500 outline-none transition-all placeholder:text-white/20 h-24 sm:h-28 resize-none"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between mt-6">
                  <button type="button" onClick={() => setIsAdding(false)} className="text-white/40 font-black text-[10px] uppercase tracking-wider hover:text-white transition-colors py-2">Terminate</button>
                  <button type="submit" className="bg-cyan-500 px-6 sm:px-8 py-2.5 rounded-xl font-black text-white text-xs tracking-wider hover:bg-cyan-400 transition-all shadow-[0_4px_15px_rgba(6,182,212,0.3)] uppercase">Confirm Entry</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal Component */}
      {editingLink && (
        <EditModal
          editingLink={editingLink}
          existingCategories={existingCategories}
          onClose={() => setEditingLink(null)}
          onSave={handleSaveEditedLink}
          onCategoryChange={handleCategoryChangeInEdit}
        />
      )}

      {/* Import Report Modal */}
      {importReport && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md">
          <div className="glass-panel w-full max-w-xl rounded-2xl p-5 sm:p-7 shadow-2xl border-white/10 relative overflow-hidden max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-4 border-b border-white/10">
              <div>
                <h2 className="text-lg sm:text-xl font-black text-white uppercase tracking-tight">Laporan Impor Backup TXT</h2>
                <p className="text-[10px] text-white/40 font-semibold uppercase tracking-wider">SevenProject Vault Data Synchronization</p>
              </div>
              <button 
                onClick={() => setImportReport(null)}
                className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-all text-xs font-bold"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-3 gap-3 my-4">
              <div className="bg-white/5 border border-white/10 rounded-xl p-3 text-center">
                <span className="text-[9px] font-black uppercase tracking-wider text-white/40 block">Total Data</span>
                <span className="text-lg sm:text-xl font-black text-white">{importReport.totalProcessed}</span>
              </div>
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 text-center">
                <span className="text-[9px] font-black uppercase tracking-wider text-emerald-400 block">Berhasil</span>
                <span className="text-lg sm:text-xl font-black text-emerald-400">{importReport.validItems.length}</span>
              </div>
              <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-3 text-center">
                <span className="text-[9px] font-black uppercase tracking-wider text-rose-400 block">Gagal / Invalid</span>
                <span className="text-lg sm:text-xl font-black text-rose-400">{importReport.invalidItems.length}</span>
              </div>
            </div>

            {importReport.invalidItems.length > 0 ? (
              <div className="flex-1 overflow-y-auto space-y-3 my-2 pr-1 custom-scrollbar max-h-60">
                <p className="text-xs font-bold text-rose-400 uppercase tracking-wider">Daftar Shortcut Bermasalah ({importReport.invalidItems.length}):</p>
                {importReport.invalidItems.map((item, idx) => (
                  <div key={idx} className="bg-rose-950/20 border border-rose-500/20 rounded-xl p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-black text-rose-300">Shortcut {item.shortcutNumber}</span>
                      <span className="text-[10px] text-white/40 font-mono truncate max-w-[200px]">{item.rawTitle}</span>
                    </div>
                    <ul className="list-disc list-inside space-y-0.5">
                      {item.errors.map((errStr, errIdx) => (
                        <li key={errIdx} className="text-[11px] text-rose-200/80 font-medium">
                          {errStr}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ) : (
              <div className="my-4 text-center py-5 bg-emerald-500/5 border border-emerald-500/10 rounded-xl">
                <div className="w-10 h-10 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto mb-2 text-xl font-black">✓</div>
                <p className="text-sm font-bold text-emerald-300">Seluruh {importReport.validItems.length} shortcut berhasil diimpor tanpa kendala!</p>
                <p className="text-xs text-white/40 mt-1">Data tersimpan secara otomatis dan tersinkron ke Firebase Realtime.</p>
              </div>
            )}

            <div className="pt-4 border-t border-white/10 flex justify-end">
              <button
                onClick={() => setImportReport(null)}
                className="bg-cyan-500 px-6 py-2 rounded-xl font-black text-white text-xs uppercase tracking-wider hover:bg-cyan-400 transition-all shadow-[0_4px_15px_rgba(6,182,212,0.3)]"
              >
                Tutup & Lanjutkan
              </button>
            </div>
          </div>
        </div>
      )}

      {isBackupModalOpen && (
        <BackupRestoreModal
          links={links}
          settings={{ viewMode, sortBy, selectedCategory }}
          initialTab={backupModalInitialTab}
          onClose={() => setIsBackupModalOpen(false)}
          onRestoreComplete={(updatedLinks) => {
            setLinks(updatedLinks);
          }}
        />
      )}

      {isSecuritySettingsOpen && (
        <MasterPinSettingsModal
          onClose={() => setIsSecuritySettingsOpen(false)}
          onLock={() => setIsUnlocked(false)}
        />
      )}
    </div>
  );
};

export default App;
