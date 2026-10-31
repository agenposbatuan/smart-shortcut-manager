import { collection, onSnapshot, doc, setDoc, deleteDoc, getDocs, writeBatch } from "firebase/firestore";
import { db, auth } from "./firebase";
import { LinkItem } from "../types";

const LINKS_COLLECTION = "links";
const CACHE_KEY = "sevenproject_links_cache";

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const currentUser = auth.currentUser;
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: currentUser?.uid || null,
      email: currentUser?.email || null,
      emailVerified: currentUser?.emailVerified || null,
      isAnonymous: currentUser?.isAnonymous || null,
      tenantId: currentUser?.tenantId || null,
      providerInfo: currentUser?.providerData?.map(p => ({
        providerId: p.providerId,
        email: p.email
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export function getCachedLinks(): LinkItem[] {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {
    console.warn("Failed to read links cache:", e);
  }
  return [];
}

export function setCachedLinks(links: LinkItem[]) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(links));
  } catch (e) {
    console.warn("Failed to save links cache:", e);
  }
}

export const subscribeToLinks = (
  callback: (links: LinkItem[]) => void,
  onError?: (error: any) => void
) => {
  // Immediately load cached links to ensure instant UI rendering
  const initialCache = getCachedLinks();
  if (initialCache.length > 0) {
    callback(initialCache);
  }

  let activeUnsubscribe: (() => void) | null = null;
  let retryTimer: any = null;
  let isCancelled = false;

  const startListener = () => {
    if (isCancelled) return;

    const colRef = collection(db, LINKS_COLLECTION);
    activeUnsubscribe = onSnapshot(
      colRef,
      async (snapshot) => {
        if (snapshot.empty) {
          setCachedLinks([]);
          callback([]);
          return;
        }

        const items: LinkItem[] = [];
        const defaultDocsToDelete: string[] = [];

        snapshot.forEach((docSnap) => {
          const data = docSnap.data() as LinkItem;
          const id = docSnap.id || data.id;
          if (id.startsWith('default-')) {
            defaultDocsToDelete.push(id);
          } else {
            items.push({
              ...data,
              id,
            });
          }
        });

        // Clean up default initial seeded docs if present
        if (defaultDocsToDelete.length > 0) {
          for (const defaultId of defaultDocsToDelete) {
            try {
              await deleteDoc(doc(db, LINKS_COLLECTION, defaultId));
            } catch (e) {
              console.error("Failed to cleanup default doc:", e);
            }
          }
        }

        // Sort deterministically by order, then createdAt
        items.sort((a, b) => {
          const orderA = typeof a.order === 'number' ? a.order : 999999;
          const orderB = typeof b.order === 'number' ? b.order : 999999;
          if (orderA !== orderB) {
            return orderA - orderB;
          }
          return (b.createdAt || 0) - (a.createdAt || 0);
        });

        setCachedLinks(items);
        callback(items);
      },
      (err) => {
        console.error("Firestore onSnapshot error:", err);
        try {
          handleFirestoreError(err, OperationType.LIST, LINKS_COLLECTION);
        } catch (formattedErr) {
          if (onError) onError(formattedErr);
        }

        // Auto-retry connection after 3 seconds in case auth or permissions just initialized
        if (!isCancelled) {
          clearTimeout(retryTimer);
          retryTimer = setTimeout(() => {
            console.log("Retrying Firestore subscription...");
            startListener();
          }, 3000);
        }
      }
    );
  };

  startListener();

  return () => {
    isCancelled = true;
    clearTimeout(retryTimer);
    if (activeUnsubscribe) {
      activeUnsubscribe();
    }
  };
};

export const fetchAllLinksOnce = async (): Promise<LinkItem[]> => {
  try {
    const colRef = collection(db, LINKS_COLLECTION);
    const snapshot = await getDocs(colRef);
    const items: LinkItem[] = [];
    snapshot.forEach(docSnap => {
      const data = docSnap.data() as LinkItem;
      const id = docSnap.id || data.id;
      if (!id.startsWith('default-')) {
        items.push({ ...data, id });
      }
    });
    return items;
  } catch (err) {
    console.warn("Failed to fetch fresh links from Firestore, using cache:", err);
    return getCachedLinks();
  }
};

/**
 * Membersihkan properti 'undefined' dari objek secara rekursif
 * agar setDoc / updateDoc di Firestore tidak error dengan pesan:
 * "Unsupported field value: undefined"
 */
export function cleanFirestoreData<T extends Record<string, any>>(obj: T): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        result[key] = cleanFirestoreData(value);
      } else {
        result[key] = value;
      }
    }
  }
  return result;
}

export const saveLink = async (link: LinkItem): Promise<void> => {
  // Update local cache optimistically
  const cached = getCachedLinks();
  const index = cached.findIndex(l => l.id === link.id);
  if (index >= 0) {
    cached[index] = link;
  } else {
    cached.push(link);
  }
  setCachedLinks(cached);

  const docRef = doc(db, LINKS_COLLECTION, link.id);
  try {
    await setDoc(docRef, cleanFirestoreData(link), { merge: true });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `${LINKS_COLLECTION}/${link.id}`);
  }
};

export const deleteLink = async (id: string): Promise<void> => {
  // Update local cache optimistically
  const cached = getCachedLinks().filter(l => l.id !== id);
  setCachedLinks(cached);

  const docRef = doc(db, LINKS_COLLECTION, id);
  try {
    await deleteDoc(docRef);
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `${LINKS_COLLECTION}/${id}`);
  }
};

export const updateLink = async (updatedLink: LinkItem): Promise<void> => {
  // Update local cache optimistically
  const cached = getCachedLinks();
  const index = cached.findIndex(l => l.id === updatedLink.id);
  if (index >= 0) {
    cached[index] = updatedLink;
    setCachedLinks(cached);
  }

  const docRef = doc(db, LINKS_COLLECTION, updatedLink.id);
  try {
    await setDoc(docRef, cleanFirestoreData(updatedLink), { merge: true });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `${LINKS_COLLECTION}/${updatedLink.id}`);
  }
};

/**
 * Memulihkan (Restore) seluruh shortcut ke Firestore & cache secara utuh
 * Mode OVERWRITE: Menghapus data usang yang tidak ada di backup, dan menyimpan data backup 1:1
 * Mode MERGE: Menggabungkan data backup dengan data yang ada tanpa menghapus data saat ini
 */
export const restoreAllLinks = async (
  newItems: LinkItem[],
  mode: 'OVERWRITE' | 'MERGE'
): Promise<LinkItem[]> => {
  const colRef = collection(db, LINKS_COLLECTION);
  
  if (mode === 'OVERWRITE') {
    try {
      // Ambil seluruh dokumen saat ini untuk dihapus jika tidak ada dalam daftar backup
      const snapshot = await getDocs(colRef);
      const newIdsSet = new Set(newItems.map(item => item.id));

      const deletePromises: Promise<void>[] = [];
      snapshot.forEach(docSnap => {
        if (!newIdsSet.has(docSnap.id)) {
          deletePromises.push(deleteDoc(doc(db, LINKS_COLLECTION, docSnap.id)));
        }
      });
      await Promise.all(deletePromises);
    } catch (e) {
      console.warn("Notice during cleanup of obsolete records:", e);
    }
  }

  // Simpan seluruh data baru ke Firestore dengan sanitasi data bersih
  for (const item of newItems) {
    const docRef = doc(db, LINKS_COLLECTION, item.id);
    const cleaned = cleanFirestoreData(item);
    await setDoc(docRef, cleaned, { merge: true });
  }

  // Update local cache
  if (mode === 'OVERWRITE') {
    setCachedLinks(newItems);
  } else {
    const currentCached = getCachedLinks();
    const map = new Map<string, LinkItem>();
    currentCached.forEach(i => map.set(i.id, i));
    newItems.forEach(i => map.set(i.id, i));
    setCachedLinks(Array.from(map.values()));
  }

  return newItems;
};

/**
 * Menghapus seluruh catatan (notes) dari semua shortcut dalam database dan cache
 */
export const clearAllShortcutNotes = async (
  currentItems?: LinkItem[]
): Promise<LinkItem[]> => {
  const items = currentItems && currentItems.length > 0 
    ? currentItems 
    : await fetchAllLinksOnce();

  const updatedItems: LinkItem[] = items.map(item => ({
    ...item,
    notes: '',
    updatedAt: Date.now()
  }));

  // Update in Firestore
  for (const item of updatedItems) {
    try {
      const docRef = doc(db, LINKS_COLLECTION, item.id);
      await setDoc(docRef, { notes: '', updatedAt: item.updatedAt }, { merge: true });
    } catch (err) {
      console.warn(`Failed to clear note for item ${item.id}:`, err);
    }
  }

  // Update local cache
  setCachedLinks(updatedItems);
  return updatedItems;
};
