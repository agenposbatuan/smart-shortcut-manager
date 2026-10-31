export interface LinkItem {
  id: string;
  url: string;
  title: string;
  description: string;
  category: string;
  tags: string[];
  createdAt: number;
  updatedAt?: number;
  icon?: string;
  order: number;
  clicks: number; // Feature: Track usage
  isPinned?: boolean; // Feature: Pin important links
  notes?: string; // Personal notes / catatan
  iconType?: 'default' | 'upload' | 'url'; // Feature: Custom icon type
  iconUrl?: string; // Feature: URL for image icon or base64 storage
  customIcon?: string; // Feature: Custom image data or URL
  [key: string]: any; // Allow dynamic / extended fields to prevent field dropping
}

export interface GeminiLinkAnalysis {
  title: string;
  description: string;
  category: string;
  tags: string[];
}

export interface AppSettings {
  viewMode?: string;
  sortBy?: 'MANUAL' | 'CLICKS' | 'RECENT';
  selectedCategory?: string;
  [key: string]: any;
}

export interface AppBackupPackage {
  app: string;
  version: string;
  schemaVersion: number;
  exportedAt: string;
  exportedTimestamp: number;
  stats: {
    totalShortcuts: number;
    totalCategories: number;
    totalClicks: number;
    pinnedCount: number;
    notesCount: number;
  };
  settings?: AppSettings;
  categories: string[];
  shortcuts: LinkItem[];
  checksum?: string;
}

export interface BackupValidationAudit {
  isValid: boolean;
  totalShortcuts: number;
  totalCategories: number;
  shortcutsWithNotes: number;
  pinnedShortcuts: number;
  categoriesList: string[];
  checksum: string;
  errors: string[];
  warnings: string[];
}

export interface RestoreValidationReport {
  isSuccess: boolean;
  mode: 'OVERWRITE' | 'MERGE';
  sourceTotal: number;
  restoredTotal: number;
  categoriesCount: number;
  notesCount: number;
  pinnedCount: number;
  orderIntegrityValid: boolean;
  checksumMatched: boolean;
  discrepancies: string[];
  timestamp: number;
}
