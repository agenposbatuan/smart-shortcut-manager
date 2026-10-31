export const cleanCategoryName = (cat: string): string => {
  if (!cat) return 'OTHER';
  // Strip leading numbers like "01. ", "02 - ", "1. " if present
  const cleaned = cat.replace(/^\d+[\.\s\-]+\s*/, '').trim();
  return cleaned || cat.trim();
};

export const CANONICAL_CATEGORIES = [
  'AI',
  'AI KIDS',
  'AI MUSIC',
  'AI (OTHER)',
  'AI ( OTHER )',
  'WEBSITE',
  'EMAIL',
  'WEBSITE AI',
  'WEBSITE GAME',
  'WEBSITE FREELANCERS',
  'WEBSITE HIBURAN',
  'WEBSITE STUDIO',
  'STUDIO',
  'AI MAKE 2026',
];

export const getCategorySortRank = (cat: string): number => {
  if (!cat) return 9990;
  const clean = cleanCategoryName(cat).toUpperCase().replace(/\s+/g, ' ').trim();

  // Check exact canonical match first
  for (let i = 0; i < CANONICAL_CATEGORIES.length; i++) {
    const canonical = CANONICAL_CATEGORIES[i].toUpperCase().replace(/\s+/g, ' ').trim();
    if (clean === canonical) {
      return (i + 1) * 10;
    }
  }

  // If cat has an embedded leading number e.g. "13. SOMETHING"
  const match = cat.trim().match(/^(\d+)[\.\s\-]+/);
  if (match) {
    const num = parseInt(match[1], 10);
    return num * 10;
  }

  // Fallback for custom categories
  return 9990;
};

export const compareCategories = (
  catA: string,
  catB: string,
  firstUsedA: number = 0,
  firstUsedB: number = 0
): number => {
  const rankA = getCategorySortRank(catA);
  const rankB = getCategorySortRank(catB);

  if (rankA !== rankB) {
    return rankA - rankB;
  }

  if (firstUsedA !== firstUsedB && firstUsedA > 0 && firstUsedB > 0) {
    return firstUsedA - firstUsedB;
  }

  const cleanA = cleanCategoryName(catA);
  const cleanB = cleanCategoryName(catB);
  return cleanA.localeCompare(cleanB);
};

export const formatCategoryWithNumber = (cat: string, index?: number): string => {
  if (!cat) return 'OTHER';
  const clean = cleanCategoryName(cat);
  if (typeof index === 'number') {
    const num = index + 1;
    const numStr = num < 10 ? `0${num}` : `${num}`;
    return `${numStr}. ${clean.toUpperCase()}`;
  }
  const match = cat.trim().match(/^(\d+)[\.\s\-]+\s*(.*)$/);
  if (match) {
    const num = parseInt(match[1], 10);
    const numStr = num < 10 ? `0${num}` : `${num}`;
    const name = match[2].trim();
    return `${numStr}. ${name.toUpperCase()}`;
  }
  return clean.toUpperCase();
};

export const formatShortcutTitle = (title: string, category?: string): string => {
  if (!title) return '';
  let text = title.trim();

  // Strip redundant category prefix from title if present
  if (category) {
    const rawCat = category.trim();
    const cleanCat = cleanCategoryName(category);

    const prefixes = [rawCat, cleanCat];
    for (const p of prefixes) {
      if (p && p.length > 0) {
        const escaped = p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // Match prefix with optional leading numbers/dots and optional separator (- : .)
        const re = new RegExp(`^(?:\\d+[\\.\\s\\-]+\\s*)?${escaped}\\s*[:\\-]?\\s*`, 'i');
        text = text.replace(re, '').trim();
      }
    }
  }

  // If text is ALL-CAPS, convert to natural Title / Sentence Case
  const hasLetters = /[a-zA-Z]/.test(text);
  const isAllCaps = hasLetters && text === text.toUpperCase();

  if (isAllCaps) {
    text = text.toLowerCase().replace(/(^\w|[\s\(\[\{-]\w)/g, m => m.toUpperCase());
  }

  return text || title.trim();
};
