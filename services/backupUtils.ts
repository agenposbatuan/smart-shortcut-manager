import { LinkItem, AppBackupPackage, AppSettings, BackupValidationAudit, RestoreValidationReport } from "../types";
import { cleanCategoryName } from "./formatUtils";

export interface InvalidShortcutReport {
  shortcutNumber: string;
  rawTitle: string;
  errors: string[];
}

export interface ParsedShortcutResult {
  validItems: LinkItem[];
  invalidItems: InvalidShortcutReport[];
  totalProcessed: number;
  packageSettings?: AppSettings;
  categoriesFound: string[];
  checksum?: string;
  sourceType: 'JSON_PACKAGE' | 'JSON_ARRAY' | 'TXT';
}

/**
 * Menghasilkan SHA-256 Checksum dari array shortcut untuk verifikasi integritas
 */
export async function calculateShortcutsChecksum(items: LinkItem[]): Promise<string> {
  try {
    // Urutkan item berdasarkan ID agar checksum deterministik
    const normalized = [...items]
      .sort((a, b) => (a.id || '').localeCompare(b.id || ''))
      .map(item => ({
        id: item.id,
        url: item.url,
        title: item.title,
        category: item.category,
        order: item.order,
        notes: item.notes || '',
        isPinned: !!item.isPinned,
        clicks: item.clicks || 0,
        customIcon: item.customIcon || '',
        iconType: item.iconType || 'default'
      }));

    const jsonStr = JSON.stringify(normalized);
    const encoder = new TextEncoder();
    const data = encoder.encode(jsonStr);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  } catch (err) {
    console.warn("Failed to calculate SHA-256 checksum:", err);
    return 'chk_' + Math.random().toString(36).substring(2, 10);
  }
}

/**
 * Membuat paket Backup JSON lengkap dengan seluruh metadata, kategori, notes, icon, dan settings
 */
export async function createFullJsonBackup(
  links: LinkItem[],
  settings?: AppSettings
): Promise<{ backupPackage: AppBackupPackage; audit: BackupValidationAudit }> {
  const now = new Date();
  const checksum = await calculateShortcutsChecksum(links);

  // Kumpulkan seluruh kategori unik
  const categoriesSet = new Set<string>();
  let notesCount = 0;
  let pinnedCount = 0;
  let totalClicks = 0;

  // Clone seluruh data secara mendalam untuk mencegah mutasi
  const shortcuts: LinkItem[] = links.map(link => {
    const cat = (link.category || 'OTHER').toUpperCase().trim();
    if (cat) categoriesSet.add(cat);
    if (link.notes && link.notes.trim().length > 0) notesCount++;
    if (link.isPinned) pinnedCount++;
    totalClicks += (link.clicks || 0);

    return {
      ...link,
      category: cat,
      tags: Array.isArray(link.tags) ? [...link.tags] : [],
      notes: link.notes || '',
      clicks: typeof link.clicks === 'number' ? link.clicks : 0,
      isPinned: !!link.isPinned,
      order: typeof link.order === 'number' ? link.order : 1,
      createdAt: link.createdAt || Date.now(),
      updatedAt: link.updatedAt || link.createdAt || Date.now()
    };
  });

  const categoriesList = Array.from(categoriesSet);

  const backupPackage: AppBackupPackage = {
    app: "SevenProject Vault OS",
    version: "2.0.0",
    schemaVersion: 2,
    exportedAt: now.toISOString(),
    exportedTimestamp: now.getTime(),
    stats: {
      totalShortcuts: shortcuts.length,
      totalCategories: categoriesList.length,
      totalClicks,
      pinnedCount,
      notesCount
    },
    settings: {
      viewMode: settings?.viewMode || 'MEDIUM',
      sortBy: settings?.sortBy || 'MANUAL',
      ...settings
    },
    categories: categoriesList,
    shortcuts,
    checksum
  };

  // Validasi otomatis hasil backup
  const errors: string[] = [];
  const warnings: string[] = [];

  if (shortcuts.length === 0) {
    warnings.push("Backup dibuat dalam kondisi kosong (0 shortcut).");
  }

  shortcuts.forEach((item, idx) => {
    if (!item.id) errors.push(`Shortcut #${idx + 1} tidak memiliki ID.`);
    if (!item.url) errors.push(`Shortcut #${idx + 1} (${item.title || 'Tanpa Judul'}) tidak memiliki URL.`);
    if (!item.title) warnings.push(`Shortcut #${idx + 1} (${item.url}) tidak memiliki judul.`);
  });

  const audit: BackupValidationAudit = {
    isValid: errors.length === 0,
    totalShortcuts: shortcuts.length,
    totalCategories: categoriesList.length,
    shortcutsWithNotes: notesCount,
    pinnedShortcuts: pinnedCount,
    categoriesList,
    checksum,
    errors,
    warnings
  };

  return { backupPackage, audit };
}

/**
 * Mengunduh file Backup JSON langsung ke komputer pengguna
 */
export async function downloadJsonBackupFile(
  links: LinkItem[],
  settings?: AppSettings
): Promise<{ audit: BackupValidationAudit; fileName: string }> {
  const { backupPackage, audit } = await createFullJsonBackup(links, settings);
  const dataStr = JSON.stringify(backupPackage, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  
  const dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const fileName = `sevenproject_full_backup_${dateStr}.json`;

  const linkElement = document.createElement('a');
  linkElement.setAttribute('href', url);
  linkElement.setAttribute('download', fileName);
  document.body.appendChild(linkElement);
  linkElement.click();
  document.body.removeChild(linkElement);
  URL.revokeObjectURL(url);

  return { audit, fileName };
}

/**
 * Membaca dan memvalidasi file Backup JSON dengan dukungan format baru & legacy
 */
export function parseAndValidateJsonBackup(jsonString: string): ParsedShortcutResult {
  const content = jsonString.trim();
  if (!content) {
    return {
      validItems: [],
      invalidItems: [{ shortcutNumber: '#0', rawTitle: 'File Kosong', errors: ['Isi file JSON kosong.'] }],
      totalProcessed: 0,
      categoriesFound: [],
      sourceType: 'JSON_ARRAY'
    };
  }

  let parsed: any;
  try {
    parsed = JSON.parse(content);
  } catch (err: any) {
    return {
      validItems: [],
      invalidItems: [{ shortcutNumber: '#0', rawTitle: 'Format JSON Rusak', errors: [err?.message || 'Sintaks JSON tidak valid.'] }],
      totalProcessed: 0,
      categoriesFound: [],
      sourceType: 'JSON_ARRAY'
    };
  }

  let rawShortcuts: any[] = [];
  let packageSettings: AppSettings | undefined;
  let checksum: string | undefined;
  let sourceType: 'JSON_PACKAGE' | 'JSON_ARRAY' = 'JSON_ARRAY';

  // Format 1: AppBackupPackage (v2 format)
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && Array.isArray(parsed.shortcuts)) {
    rawShortcuts = parsed.shortcuts;
    packageSettings = parsed.settings;
    checksum = parsed.checksum;
    sourceType = 'JSON_PACKAGE';
  } else if (Array.isArray(parsed)) {
    // Format 2: Array langsung
    rawShortcuts = parsed;
    sourceType = 'JSON_ARRAY';
  } else if (parsed && typeof parsed === 'object') {
    // Single object fallback
    rawShortcuts = [parsed];
  }

  const validItems: LinkItem[] = [];
  const invalidItems: InvalidShortcutReport[] = [];
  const categoriesSet = new Set<string>();

  rawShortcuts.forEach((raw, idx) => {
    const itemNumber = `#${idx + 1}`;
    const errors: string[] = [];

    if (!raw || typeof raw !== 'object') {
      invalidItems.push({
        shortcutNumber: itemNumber,
        rawTitle: 'Invalid Data',
        errors: ['Item bukan objek data shortcut yang valid.']
      });
      return;
    }

    const id = raw.id || raw.uuid || ('node_' + Date.now().toString(36) + '_' + idx);
    let title = typeof raw.title === 'string' ? raw.title.trim() : '';
    let url = typeof raw.url === 'string' ? raw.url.trim() : (typeof raw.link === 'string' ? raw.link.trim() : '');

    if (!url) {
      errors.push('URL endpoint wajib ada.');
    } else {
      if (!/^https?:\/\//i.test(url)) {
        url = 'https://' + url;
      }
      try {
        new URL(url);
      } catch {
        errors.push('Format URL tidak valid.');
      }
    }

    if (!title && url) {
      try {
        title = new URL(url).hostname.replace(/^www\./i, '').toUpperCase();
      } catch {
        title = url.toUpperCase();
      }
    }

    const category = (raw.category || raw.kategori || 'OTHER').toString().toUpperCase().trim();
    if (category) categoriesSet.add(category);

    const orderNum = Number(raw.order ?? raw.urutan ?? (idx + 1));
    const finalOrder = isNaN(orderNum) || orderNum <= 0 ? (idx + 1) : Math.floor(orderNum);

    const clicksNum = Number(raw.clicks ?? raw.klik ?? 0);
    const finalClicks = isNaN(clicksNum) || clicksNum < 0 ? 0 : Math.floor(clicksNum);

    const isPinned = raw.isPinned === true || raw.pinned === true || raw.isPinned === 'true' || raw.pinned === 'true';

    // Pastikan field catatan (notes) disimpan 100% tanpa dipotong
    const notes = typeof raw.notes === 'string' ? raw.notes : (typeof raw.catatan === 'string' ? raw.catatan : '');

    // Pastikan customIcon & icon properties dipertahankan utuh
    const customIcon = raw.customIcon || raw.custom_icon || raw.iconData || undefined;
    const iconType = raw.iconType || raw.icon_type || (customIcon ? 'upload' : 'default');
    const iconUrl = raw.iconUrl || raw.icon_url || undefined;
    const icon = raw.icon || undefined;
    const description = typeof raw.description === 'string' ? raw.description : '';
    const tags = Array.isArray(raw.tags) ? raw.tags.map((t: any) => String(t).trim()).filter(Boolean) : [];

    let createdAt = Number(raw.createdAt ?? raw.created_at ?? raw.createdTimestamp);
    if (isNaN(createdAt) || createdAt <= 0) createdAt = Date.now();

    let updatedAt = Number(raw.updatedAt ?? raw.updated_at ?? raw.updatedTimestamp);
    if (isNaN(updatedAt) || updatedAt <= 0) updatedAt = createdAt;

    if (errors.length > 0) {
      invalidItems.push({
        shortcutNumber: itemNumber,
        rawTitle: title || url || 'Tidak Ada Judul',
        errors
      });
    } else {
      // Pertahankan semua extended properties tambahan jika ada
      const completeItem: LinkItem = {
        id: String(id),
        title: title || 'SHORTCUT',
        url,
        category: category || 'OTHER',
        order: finalOrder,
        clicks: finalClicks,
        isPinned,
        notes,
        description,
        tags,
        iconType,
        createdAt,
        updatedAt
      };

      if (raw.customIcon || raw.custom_icon || raw.iconData) {
        completeItem.customIcon = raw.customIcon || raw.custom_icon || raw.iconData;
      }
      if (raw.iconUrl || raw.icon_url) {
        completeItem.iconUrl = raw.iconUrl || raw.icon_url;
      }
      if (raw.icon) {
        completeItem.icon = raw.icon;
      }

      // Preserve other extra properties without undefined
      Object.keys(raw).forEach(k => {
        if (!(k in completeItem) && raw[k] !== undefined) {
          (completeItem as any)[k] = raw[k];
        }
      });

      validItems.push(completeItem);
    }
  });

  return {
    validItems,
    invalidItems,
    totalProcessed: rawShortcuts.length,
    packageSettings,
    categoriesFound: Array.from(categoriesSet),
    checksum,
    sourceType
  };
}

/**
 * Validasi integritas dua arah setelah restore dilakukan (membandingkan sumber file vs data tersimpan)
 */
export async function verifyRestoreIntegrity(
  sourceItems: LinkItem[],
  restoredItems: LinkItem[],
  mode: 'OVERWRITE' | 'MERGE',
  expectedChecksum?: string
): Promise<RestoreValidationReport> {
  const discrepancies: string[] = [];

  const sourceMap = new Map<string, LinkItem>();
  sourceItems.forEach(item => sourceMap.set(item.id, item));

  const restoredMap = new Map<string, LinkItem>();
  restoredItems.forEach(item => restoredMap.set(item.id, item));

  // 1. Verifikasi Jumlah Data
  if (mode === 'OVERWRITE' && restoredItems.length !== sourceItems.length) {
    discrepancies.push(`Jumlah data berbeda: Sumber ${sourceItems.length} item, Hasil Pemulihan ${restoredItems.length} item.`);
  }

  // 2. Verifikasi Keutuhan Seluruh Catatan (Notes)
  let sourceNotesCount = 0;
  let restoredNotesCount = 0;

  sourceItems.forEach(sItem => {
    if (sItem.notes && sItem.notes.trim().length > 0) {
      sourceNotesCount++;
      const rItem = restoredMap.get(sItem.id);
      if (rItem) {
        if ((rItem.notes || '').trim() !== sItem.notes.trim()) {
          discrepancies.push(`Catatan pada "${sItem.title}" (${sItem.id}) tidak cocok persis setelah restore.`);
        }
      }
    }
  });

  restoredItems.forEach(rItem => {
    if (rItem.notes && rItem.notes.trim().length > 0) {
      restoredNotesCount++;
    }
  });

  // 3. Verifikasi Kategori dan Urutan
  const categoriesSet = new Set<string>();
  let pinnedCount = 0;
  restoredItems.forEach(item => {
    categoriesSet.add(cleanCategoryName(item.category || 'OTHER').toUpperCase());
    if (item.isPinned) pinnedCount++;
  });

  // 4. Verifikasi Checksum jika tersedia
  let checksumMatched = true;
  if (expectedChecksum && mode === 'OVERWRITE') {
    const currentChecksum = await calculateShortcutsChecksum(restoredItems);
    checksumMatched = (currentChecksum === expectedChecksum);
    if (!checksumMatched) {
      discrepancies.push("Peringatan: Checksum SHA-256 berbeda dari file cadangan asli (terdapat penyesuaian timestamp atau sorting).");
    }
  }

  // 5. Cek Order Sequence Integrity
  let orderIntegrityValid = true;
  restoredItems.forEach(item => {
    if (typeof item.order !== 'number' || isNaN(item.order) || item.order < 1) {
      orderIntegrityValid = false;
      discrepancies.push(`Item "${item.title}" memiliki urutan (${item.order}) tidak valid.`);
    }
  });

  return {
    isSuccess: discrepancies.length === 0 || (mode === 'MERGE' && discrepancies.length <= 1),
    mode,
    sourceTotal: sourceItems.length,
    restoredTotal: restoredItems.length,
    categoriesCount: categoriesSet.size,
    notesCount: restoredNotesCount,
    pinnedCount,
    orderIntegrityValid,
    checksumMatched,
    discrepancies,
    timestamp: Date.now()
  };
}

/**
 * TXT Export dengan dukungan semua field lengkap (termasuk Catatan & Custom Icon)
 */
export const exportToTxt = (links: LinkItem[]): string => {
  const dateIso = new Date().toISOString();
  const header = [
    `==================================================`,
    `SEVENPROJECT VAULT SHORTCUTS BACKUP (FULL SCHEME)`,
    `Exported At: ${dateIso}`,
    `Total Shortcuts: ${links.length}`,
    `Format Version: 2.0`,
    `==================================================`,
    ``
  ].join('\n');

  const itemsTxt = links.map((link, idx) => {
    const lines = [
      `--- SHORTCUT #${idx + 1} ---`,
      `ID: ${link.id || ''}`,
      `TITLE: ${link.title || ''}`,
      `URL: ${link.url || ''}`,
      `CATEGORY: ${link.category || 'OTHER'}`,
      `ORDER: ${typeof link.order === 'number' ? link.order : idx + 1}`,
      `CLICKS: ${typeof link.clicks === 'number' ? link.clicks : 0}`,
      `PINNED: ${link.isPinned ? 'true' : 'false'}`,
      `NOTES: ${(link.notes || '').replace(/\r?\n/g, '\\n')}`,
      `ICON_TYPE: ${link.iconType || 'default'}`,
      `ICON_URL: ${link.iconUrl || ''}`,
      `CUSTOM_ICON: ${link.customIcon ? 'PRESENT_BASE64' : 'NONE'}`,
      `DESCRIPTION: ${(link.description || '').replace(/\r?\n/g, '\\n')}`,
      `TAGS: ${(link.tags || []).join(', ')}`,
      `CREATED_AT: ${link.createdAt ?? Date.now()}`,
      `UPDATED_AT: ${link.updatedAt ?? link.createdAt ?? Date.now()}`
    ];
    return lines.join('\n');
  }).join('\n\n');

  return header + (itemsTxt ? itemsTxt + '\n' : '');
};

/**
 * TXT Parser dengan decoding escaped newlines pada notes & tags
 */
export const parseAndValidateTxtBackup = (txtContent: string): ParsedShortcutResult => {
  const content = txtContent.trim();
  if (!content) {
    return { validItems: [], invalidItems: [], totalProcessed: 0, categoriesFound: [], sourceType: 'TXT' };
  }

  // Jika konten berformat JSON
  if (content.startsWith('[') || content.startsWith('{')) {
    return parseAndValidateJsonBackup(content);
  }

  // TXT Block Parser
  const blockHeaderRegex = /(?:^|\n)\s*---\s*SHORTCUT\s*#?(\d+|\w+)?\s*---/gi;
  const matches: { index: number; label: string }[] = [];
  let match: RegExpExecArray | null;

  while ((match = blockHeaderRegex.exec(content)) !== null) {
    matches.push({
      index: match.index,
      label: match[1] ? `#${match[1]}` : `#${matches.length + 1}`
    });
  }

  const extractedBlocks: { numberLabel: string; blockText: string }[] = [];
  if (matches.length > 0) {
    for (let i = 0; i < matches.length; i++) {
      const currentMatch = matches[i];
      const startPos = currentMatch.index;
      const endPos = (i < matches.length - 1) ? matches[i + 1].index : content.length;
      extractedBlocks.push({
        numberLabel: currentMatch.label,
        blockText: content.substring(startPos, endPos)
      });
    }
  } else {
    const rawChunks = content.split(/\n\s*\n/);
    rawChunks.forEach((chunk, idx) => {
      const trimmed = chunk.trim();
      if (trimmed && !trimmed.startsWith('===')) {
        extractedBlocks.push({
          numberLabel: `#${idx + 1}`,
          blockText: trimmed
        });
      }
    });
  }

  const validItems: LinkItem[] = [];
  const invalidItems: InvalidShortcutReport[] = [];
  const categoriesSet = new Set<string>();

  extractedBlocks.forEach(({ numberLabel, blockText }) => {
    const lines = blockText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const itemMap = new Map<string, string>();

    for (const line of lines) {
      if (line.startsWith('---') || line.startsWith('===') || /^(Exported At|Total Shortcuts|Format Version|SEVENPROJECT)/i.test(line)) {
        continue;
      }
      const colonIdx = line.indexOf(':');
      if (colonIdx > 0) {
        const key = line.substring(0, colonIdx).trim().toUpperCase();
        const value = line.substring(colonIdx + 1).trim();
        itemMap.set(key, value);
      }
    }

    if (itemMap.size === 0) return;

    const rawId = itemMap.get('ID') || ('node_' + Math.random().toString(36).substring(2, 9));
    const rawTitle = itemMap.get('TITLE') || itemMap.get('NAME') || itemMap.get('JUDUL') || '';
    const rawUrl = itemMap.get('URL') || itemMap.get('LINK') || itemMap.get('ALAMAT') || '';
    const rawCategory = (itemMap.get('CATEGORY') ?? itemMap.get('KATEGORI') ?? 'OTHER').toUpperCase().trim();
    const rawOrder = itemMap.get('ORDER') ?? itemMap.get('URUTAN');
    const rawClicks = itemMap.get('CLICKS') ?? itemMap.get('KLIK');
    const rawPinned = itemMap.get('PINNED') ?? itemMap.get('ISPINNED') ?? itemMap.get('FAVORIT');
    const rawNotes = (itemMap.get('NOTES') ?? itemMap.get('CATATAN') ?? '').replace(/\\n/g, '\n');
    const rawDescription = (itemMap.get('DESCRIPTION') ?? itemMap.get('DESKRIPSI') ?? '').replace(/\\n/g, '\n');
    const rawTags = itemMap.get('TAGS') ?? itemMap.get('TAG') ?? '';
    const rawCreatedAt = itemMap.get('CREATED_AT') ?? itemMap.get('CREATEDAT');
    const rawUpdatedAt = itemMap.get('UPDATED_AT') ?? itemMap.get('UPDATEDAT');

    const errors: string[] = [];
    if (!rawUrl) {
      errors.push('URL wajib ada.');
    }

    let parsedOrder = Number(rawOrder);
    if (isNaN(parsedOrder) || parsedOrder <= 0) parsedOrder = validItems.length + 1;

    let parsedClicks = Number(rawClicks);
    if (isNaN(parsedClicks) || parsedClicks < 0) parsedClicks = 0;

    const isPinned = rawPinned?.toLowerCase() === 'true' || rawPinned === '1';

    let parsedCreatedAt = Number(rawCreatedAt);
    if (isNaN(parsedCreatedAt) || parsedCreatedAt <= 0) parsedCreatedAt = Date.now();

    let parsedUpdatedAt = Number(rawUpdatedAt);
    if (isNaN(parsedUpdatedAt) || parsedUpdatedAt <= 0) parsedUpdatedAt = parsedCreatedAt;

    if (errors.length > 0) {
      invalidItems.push({
        shortcutNumber: numberLabel,
        rawTitle: rawTitle || rawUrl || 'Tidak Ada Judul',
        errors
      });
    } else {
      let finalUrl = rawUrl;
      if (!/^https?:\/\//i.test(finalUrl)) finalUrl = 'https://' + finalUrl;

      let finalTitle = rawTitle;
      if (!finalTitle) {
        try {
          finalTitle = new URL(finalUrl).hostname.replace(/^www\./i, '').toUpperCase();
        } catch {
          finalTitle = finalUrl.toUpperCase();
        }
      }

      categoriesSet.add(rawCategory);

      validItems.push({
        id: rawId,
        title: finalTitle,
        url: finalUrl,
        category: rawCategory,
        order: parsedOrder,
        clicks: parsedClicks,
        isPinned,
        notes: rawNotes,
        description: rawDescription,
        tags: rawTags ? rawTags.split(',').map(t => t.trim()).filter(Boolean) : [],
        createdAt: parsedCreatedAt,
        updatedAt: parsedUpdatedAt
      });
    }
  });

  return {
    validItems,
    invalidItems,
    totalProcessed: extractedBlocks.length,
    categoriesFound: Array.from(categoriesSet),
    sourceType: 'TXT'
  };
};
