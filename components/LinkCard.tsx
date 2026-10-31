
import React, { useState } from 'react';
import { LinkItem } from '../types';
import { cleanCategoryName, formatCategoryWithNumber, formatShortcutTitle } from '../services/formatUtils';

interface LinkCardProps {
  link: LinkItem;
  viewMode: string;
  isDarkMode: boolean;
  categoryName?: string;
  onDelete: (id: string) => void;
  onEdit: (link: LinkItem) => void;
  onTogglePin: (link: LinkItem) => void;
  onLinkClick: (link: LinkItem) => void;
}

const LinkCard: React.FC<LinkCardProps> = ({ link, viewMode, categoryName, onDelete, onEdit, onTogglePin, onLinkClick }) => {
  const [copied, setCopied] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  const getDomain = (url: string) => {
    try {
      const normalizedUrl = url.startsWith('http') ? url : `https://${url}`;
      return new URL(normalizedUrl).hostname;
    } catch {
      return '';
    }
  };

  const domain = getDomain(link.url);
  const defaultFavicon = domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=128` : 'https://www.gstatic.com/images/branding/product/2x/googleg_48dp.png';

  const computeIconUrl = () => {
    if (link.iconType === 'default') {
      return defaultFavicon;
    }
    if (link.iconType === 'upload' || link.iconType === 'url') {
      return link.iconUrl || link.customIcon || defaultFavicon;
    }
    return link.customIcon || link.iconUrl || link.icon || defaultFavicon;
  };

  const iconUrl = computeIconUrl();

  const formatDateTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${day}/${month}/${year} • ${hours}:${minutes}`;
  };

  const handleCopyLink = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy link', err);
    }
  };

  const lastTime = link.updatedAt || link.createdAt;
  const dateTimeStr = formatDateTime(lastTime);
  const displayCategory = categoryName || formatCategoryWithNumber(link.category);
  const formattedTitle = formatShortcutTitle(link.title, link.category);
  const orderStr = (link.order || 1).toString().padStart(2, '0');
  const usageCount = link.clicks || 0;

  const handleCardClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onLinkClick(link);
    window.open(link.url, '_blank', 'noopener,noreferrer');
  };

  const handleOpenLink = (e: React.MouseEvent) => {
    e.stopPropagation();
    onLinkClick(link);
  };

  if (viewMode === 'LIST') {
    return (
      <div 
        className={`p-3 sm:p-4 rounded-2xl glass-panel bg-[#0d121d]/80 hover:bg-[#121826] transition-all flex items-center gap-3 sm:gap-4 group cursor-pointer border border-white/10 animate-fade-scale ${link.isPinned ? 'border-l-4 border-l-cyan-400' : ''}`}
        onClick={handleCardClick}
      >
        {/* Glow Number Badge */}
        <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-[#00d2ee] text-slate-950 font-black text-xs sm:text-sm flex items-center justify-center shrink-0 shadow-[0_0_12px_rgba(0,210,238,0.5)]">
          {orderStr}
        </div>

        {/* Center Logo */}
        <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center p-2 shrink-0 bg-[#131926] border border-white/10 relative">
          <img 
            src={iconUrl} 
            alt="favicon" 
            className="w-full h-full object-contain opacity-90 group-hover:opacity-100 transition-opacity"
            loading="lazy"
            onError={(e) => {
              const target = e.currentTarget;
              if (!target.dataset.failed) {
                target.dataset.failed = 'true';
                target.src = 'https://www.gstatic.com/images/branding/product/2x/googleg_48dp.png';
              }
            }}
          />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-[#0a1e28] border border-cyan-500/30 text-cyan-400 text-[9px] font-black tracking-wide uppercase">
              {displayCategory}
            </span>
            <span className="text-[9px] font-semibold text-slate-400 whitespace-nowrap">
              • {dateTimeStr}
            </span>
            {link.isPinned && (
              <span className="text-[8px] font-black text-cyan-400 bg-cyan-500/10 px-1.5 py-0.5 rounded-full border border-cyan-500/30 uppercase">Pinned</span>
            )}
          </div>
          <h3 className="font-black text-xs sm:text-sm text-white group-hover:text-cyan-400 transition-colors leading-snug truncate uppercase tracking-wide">
            {formattedTitle}
          </h3>
          <p className="text-[9px] font-medium text-slate-500 truncate lowercase">{domain}</p>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <div className="hidden sm:flex flex-col items-end">
            <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider">{usageCount} USAGE CYCLES</span>
          </div>

          <button 
            onClick={handleCopyLink}
            title="Copy Link"
            className={`p-1.5 sm:p-2 rounded-xl transition-all ${copied ? 'bg-green-500 text-white' : 'bg-white/5 text-white/40 hover:text-cyan-400 hover:bg-white/10'}`}
          >
            {copied ? (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 sm:h-4 sm:w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 sm:h-4 sm:w-4" viewBox="0 0 20 20" fill="currentColor">
                <path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" />
                <path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z" />
              </svg>
            )}
          </button>

          <button 
            onClick={(e) => { e.stopPropagation(); onEdit(link); }}
            title="Edit Prompt / Shortcut"
            className="p-1.5 sm:p-2 rounded-xl transition-all bg-white/5 text-white/40 hover:text-cyan-400 hover:bg-white/10"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 sm:h-4 sm:w-4" viewBox="0 0 20 20" fill="currentColor">
              <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
            </svg>
          </button>
        </div>
      </div>
    );
  }

  // TILES & SMALL View (Compact 3-column mobile optimized)
  if (viewMode === 'TILES' || viewMode === 'SMALL') {
    return (
      <div 
        className={`relative group cursor-pointer transition-all duration-300 bg-[#050811] border border-cyan-400/50 hover:border-cyan-400 rounded-[22px] sm:rounded-[26px] overflow-hidden flex flex-col justify-between shadow-[0_0_15px_rgba(0,210,238,0.15)] hover:shadow-[0_0_28px_rgba(0,210,238,0.32)] hover:-translate-y-1 active:scale-[0.98] animate-fade-scale h-full min-h-[260px] sm:min-h-[300px] ${
          link.isPinned ? 'border-cyan-400 shadow-[0_0_22px_rgba(0,210,238,0.32)] ring-1 ring-cyan-400/50' : ''
        }`}
        onClick={handleCardClick}
      >
        {/* Upper Content Box */}
        <div className="p-3 sm:p-3.5 pb-2 flex flex-col items-center justify-between flex-1 w-full min-w-0">
          {/* 1. Header: Order Badge (Top-Left) & Favorite + Overflow Menu (Top-Right) */}
          <div className="flex items-center justify-between w-full relative mb-1.5">
            {/* Glow Number Badge (Pojok Kiri Atas) */}
            <div className="w-6.5 h-6.5 sm:w-7.5 sm:h-7.5 rounded-full bg-[#00d2ee] text-slate-950 font-black text-[10px] sm:text-xs flex items-center justify-center shrink-0 shadow-[0_0_12px_rgba(0,210,238,0.85)]">
              {orderStr}
            </div>

            {/* Top Right Actions: Favorite (Star) & Overflow (⋮) */}
            <div className="flex items-center gap-1 shrink-0">
              {/* Tombol Favorite / Bintang */}
              <button 
                onClick={(e) => { e.stopPropagation(); onTogglePin(link); }}
                title={link.isPinned ? "Batal Favorit" : "Jadikan Favorit"}
                className={`w-6.5 h-6.5 sm:w-7.5 sm:h-7.5 rounded-full flex items-center justify-center transition-all border ${
                  link.isPinned 
                    ? 'bg-amber-400/20 text-amber-400 border-amber-400/60 shadow-[0_0_8px_rgba(251,191,36,0.35)]' 
                    : 'bg-[#101726]/80 text-white/40 hover:bg-white/10 hover:text-amber-400 border-white/10'
                }`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 sm:w-4 sm:h-4" viewBox="0 0 24 24" fill={link.isPinned ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
              </button>

              {/* Tombol Overflow Menu (⋮) */}
              <button 
                onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}
                title="Aksi Lanjutan"
                className={`w-6.5 h-6.5 sm:w-7.5 sm:h-7.5 rounded-full flex items-center justify-center transition-all border ${
                  showMenu 
                    ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/50' 
                    : 'bg-[#101726]/80 text-white/40 hover:bg-white/10 hover:text-cyan-400 border-white/10'
                }`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 sm:w-4 sm:h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="5" r="1" />
                  <circle cx="12" cy="12" r="1" />
                  <circle cx="12" cy="19" r="1" />
                </svg>
              </button>
            </div>

            {/* Menu Overflow Dropdown Popup */}
            {showMenu && (
              <>
                <div 
                  className="fixed inset-0 z-40" 
                  onClick={(e) => { e.stopPropagation(); setShowMenu(false); }} 
                />
                <div 
                  className="absolute right-0 top-7 sm:top-8 z-50 min-w-[125px] bg-[#0c1322] border border-cyan-500/40 rounded-xl shadow-[0_8px_24px_rgba(0,0,0,0.85)] p-1 flex flex-col gap-0.5 text-[10px] sm:text-[11px] font-semibold text-slate-200 animate-fade-scale backdrop-blur-md"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={handleCopyLink}
                    className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-cyan-500/15 hover:text-cyan-400 transition-colors w-full text-left"
                  >
                    {copied ? (
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-green-400 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-cyan-400 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" />
                        <path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z" />
                      </svg>
                    )}
                    <span>{copied ? 'Tersalin!' : 'Salin URL'}</span>
                  </button>

                  <button
                    onClick={(e) => { e.stopPropagation(); setShowMenu(false); onEdit(link); }}
                    className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-cyan-500/15 hover:text-cyan-400 transition-colors w-full text-left"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-cyan-400 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                    </svg>
                    <span>Edit</span>
                  </button>

                  <button
                    onClick={(e) => { e.stopPropagation(); setShowMenu(false); onDelete(link.id); }}
                    className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-red-500/20 text-red-400 transition-colors w-full text-left"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-red-400 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    <span>Hapus</span>
                  </button>
                </div>
              </>
            )}
          </div>

          {/* 2. Enlarged Icon Shortcut Container (Tengah Atas) ~56px-64px */}
          <div className="flex justify-center my-2 sm:my-2.5">
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-[18px] sm:rounded-[20px] bg-[#080e1b] border border-cyan-400/50 flex items-center justify-center p-2.5 shadow-[0_0_12px_rgba(0,210,238,0.2)] group-hover:scale-105 group-hover:border-cyan-300 transition-all duration-300">
              <img 
                src={iconUrl} 
                alt="favicon" 
                className="w-9 h-9 sm:w-11 sm:h-11 object-contain opacity-95 group-hover:opacity-100 transition-opacity drop-shadow-[0_0_8px_rgba(0,210,238,0.3)]"
                loading="lazy"
                onError={(e) => {
                  const target = e.currentTarget;
                  if (!target.dataset.failed) {
                    target.dataset.failed = 'true';
                    target.src = 'https://www.gstatic.com/images/branding/product/2x/googleg_48dp.png';
                  }
                }}
              />
            </div>
          </div>

          {/* Info Stack with Generous Spacing */}
          <div className="flex flex-col items-center text-center w-full min-w-0 space-y-1.5 my-1">
            {/* 3. Category Pill Badge */}
            <div className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-[#071825] border border-cyan-400/60 text-[#00d2ee] text-[8.5px] sm:text-[9.5px] font-black tracking-wider uppercase shadow-sm max-w-full truncate">
              {displayCategory}
            </div>

            {/* 4. Tanggal dan Waktu */}
            <div className="text-[8px] sm:text-[9px] font-semibold text-slate-400/90 tracking-tight leading-none">
              {dateTimeStr}
            </div>

            {/* 5. Domain */}
            <span className="text-[8.5px] sm:text-[9.5px] font-medium text-slate-300/90 truncate lowercase w-full text-center">
              {domain}
            </span>

            {/* Optional 1-line Description */}
            {link.description && (
              <p className="text-[8px] sm:text-[9px] text-slate-400/75 truncate max-w-full px-1 leading-tight italic">
                {link.description}
              </p>
            )}

            {/* Status Indicator */}
            <div className="flex items-center gap-1 text-[7.5px] sm:text-[8.5px] font-bold text-emerald-400/90 tracking-widest uppercase pt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)] animate-pulse" />
              <span>ONLINE</span>
            </div>
          </div>
        </div>

        {/* 6. Full-Width Cyan Shortcut Button (Bottom Action Footer) */}
        <div 
          onClick={handleCardClick}
          className="w-full bg-[#00d2ee] group-hover:bg-[#1ce2ff] transition-colors py-2.5 sm:py-3 px-2 min-h-[48px] sm:min-h-[54px] flex items-center justify-center text-center shadow-[0_-2px_10px_rgba(0,210,238,0.25)] rounded-b-[22px] sm:rounded-b-[26px]"
        >
          <span className="font-black text-slate-950 text-[11px] sm:text-xs tracking-wide uppercase line-clamp-2 break-words leading-tight px-1">
            {formattedTitle}
          </span>
        </div>
      </div>
    );
  }

  // STANDARD / MEDIUM View (Exact Portrait 1:1.35–1.45 Ratio Match)
  return (
    <div 
      className={`relative group cursor-pointer transition-all duration-300 bg-[#050811] border border-cyan-400/60 hover:border-cyan-400 rounded-[26px] sm:rounded-[30px] overflow-hidden flex flex-col justify-between shadow-[0_0_18px_rgba(0,210,238,0.18)] hover:shadow-[0_0_32px_rgba(0,210,238,0.38)] hover:-translate-y-1 animate-fade-scale h-full min-h-[340px] sm:min-h-[385px] ${
        link.isPinned ? 'border-cyan-400 shadow-[0_0_26px_rgba(0,210,238,0.38)] ring-1 ring-cyan-400/50' : ''
      }`}
      onClick={handleCardClick}
    >
      {/* Upper Content Container (~75% vertical space) */}
      <div className="p-4 sm:p-5 pb-3 flex flex-col items-center justify-between flex-1 w-full min-w-0">
        {/* 1. Header: Order Badge (Top-Left) & Favorite + Overflow Menu (Top-Right) */}
        <div className="flex items-center justify-between w-full relative">
          {/* Glow Number Badge */}
          <div className="w-7.5 h-7.5 sm:w-8.5 sm:h-8.5 rounded-full bg-[#00d2ee] text-slate-950 font-black text-xs sm:text-sm flex items-center justify-center shrink-0 shadow-[0_0_14px_rgba(0,210,238,0.9)]">
            {orderStr}
          </div>

          {/* Action Controls Box */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Tombol Favorite / Bintang */}
            <button 
              onClick={(e) => { e.stopPropagation(); onTogglePin(link); }}
              title={link.isPinned ? "Batal Favorit" : "Jadikan Favorit"}
              className={`w-7.5 h-7.5 sm:w-8.5 sm:h-8.5 rounded-full flex items-center justify-center transition-all border ${
                link.isPinned 
                  ? 'bg-amber-400/20 text-amber-400 border-amber-400/60 shadow-[0_0_10px_rgba(251,191,36,0.4)]' 
                  : 'bg-[#101726]/80 text-white/40 hover:bg-white/10 hover:text-amber-400 border-white/10'
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 sm:w-4.5 sm:h-4.5" viewBox="0 0 24 24" fill={link.isPinned ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
            </button>

            {/* Tombol Overflow Menu (⋮) */}
            <button 
              onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}
              title="Aksi Lanjutan"
              className={`w-7.5 h-7.5 sm:w-8.5 sm:h-8.5 rounded-full flex items-center justify-center transition-all border ${
                showMenu 
                  ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/50' 
                  : 'bg-[#101726]/80 text-white/40 hover:bg-white/10 hover:text-cyan-400 border-white/10'
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 sm:w-4.5 sm:h-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="5" r="1" />
                <circle cx="12" cy="12" r="1" />
                <circle cx="12" cy="19" r="1" />
              </svg>
            </button>
          </div>

          {/* Menu Overflow Dropdown Popup */}
          {showMenu && (
            <>
              <div 
                className="fixed inset-0 z-40" 
                onClick={(e) => { e.stopPropagation(); setShowMenu(false); }} 
              />
              <div 
                className="absolute right-0 top-8 sm:top-9 z-50 min-w-[130px] bg-[#0c1322] border border-cyan-500/40 rounded-xl shadow-[0_8px_24px_rgba(0,0,0,0.85)] p-1.5 flex flex-col gap-0.5 text-xs font-semibold text-slate-200 animate-fade-scale backdrop-blur-md"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  onClick={handleCopyLink}
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-cyan-500/15 hover:text-cyan-400 transition-colors w-full text-left"
                >
                  {copied ? (
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-green-400 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-cyan-400 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" />
                      <path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z" />
                    </svg>
                  )}
                  <span>{copied ? 'Tersalin!' : 'Salin URL'}</span>
                </button>

                <button
                  onClick={(e) => { e.stopPropagation(); setShowMenu(false); onEdit(link); }}
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-cyan-500/15 hover:text-cyan-400 transition-colors w-full text-left"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-cyan-400 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                  </svg>
                  <span>Edit</span>
                </button>

                <button
                  onClick={(e) => { e.stopPropagation(); setShowMenu(false); onDelete(link.id); }}
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-red-500/20 text-red-400 transition-colors w-full text-left"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-red-400 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  <span>Hapus</span>
                </button>
              </div>
            </>
          )}
        </div>

        {/* 2. Enlarged Icon Shortcut Container (76px-82px) */}
        <div className="flex justify-center my-3 sm:my-4">
          <div className="w-18 h-18 sm:w-21 sm:h-21 rounded-[22px] sm:rounded-[26px] bg-[#080e1b] border border-cyan-400/50 flex items-center justify-center p-3 shadow-[0_0_18px_rgba(0,210,238,0.22)] group-hover:scale-105 group-hover:border-cyan-300 transition-all duration-300">
            <img 
              src={iconUrl} 
              alt="favicon" 
              className="w-12 h-12 sm:w-14 sm:h-14 object-contain opacity-95 group-hover:opacity-100 transition-opacity drop-shadow-[0_0_10px_rgba(0,210,238,0.35)]"
              loading="lazy"
              onError={(e) => {
                const target = e.currentTarget;
                if (!target.dataset.failed) {
                  target.dataset.failed = 'true';
                  target.src = 'https://www.gstatic.com/images/branding/product/2x/googleg_48dp.png';
                }
              }}
            />
          </div>
        </div>

        {/* 3, 4, 5. Info Section with Balanced Vertical Spacing */}
        <div className="flex flex-col items-center text-center w-full min-w-0 space-y-2 mb-1">
          {/* 3. Category Pill Badge */}
          <div className="inline-flex items-center px-3.5 py-0.5 rounded-full bg-[#071825] border border-cyan-400/60 text-[#00d2ee] text-[9.5px] sm:text-[10.5px] font-black tracking-wider uppercase shadow-sm max-w-full truncate">
            {displayCategory}
          </div>

          {/* 4. Tanggal dan Waktu */}
          <div className="text-[9px] sm:text-[10px] font-semibold text-slate-400/90 tracking-tight leading-none">
            {dateTimeStr}
          </div>

          {/* 5. Domain */}
          <span className="text-[9.5px] sm:text-[10.5px] font-medium text-slate-300/90 truncate lowercase w-full text-center">
            {domain}
          </span>

          {/* Optional 1-line Description */}
          {link.description && (
            <p className="text-[8.5px] sm:text-[9.5px] text-slate-400/80 truncate max-w-full px-2 leading-tight italic">
              {link.description}
            </p>
          )}

          {/* Status Indicator */}
          <div className="flex items-center gap-1.5 text-[8px] sm:text-[9px] font-bold text-emerald-400/90 tracking-widest uppercase pt-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)] animate-pulse" />
            <span>ONLINE</span>
          </div>
        </div>
      </div>

      {/* 6. Full-Width Cyan Shortcut Button (Bottom Action Footer: 54px-62px) */}
      <div 
        onClick={handleCardClick}
        className="w-full bg-[#00d2ee] group-hover:bg-[#1ce2ff] transition-colors py-3.5 sm:py-4 px-3 min-h-[54px] sm:min-h-[62px] flex items-center justify-center text-center shadow-[0_-2px_12px_rgba(0,210,238,0.25)] rounded-b-[26px] sm:rounded-b-[30px]"
      >
        <span className="font-black text-slate-950 text-xs sm:text-sm tracking-wide uppercase line-clamp-2 break-words leading-tight px-1">
          {formattedTitle}
        </span>
      </div>
    </div>
  );
};

export default LinkCard;
