import settings from '../data/settings.json' with { type: 'json' };

/** Canonicalize extensionless internal routes without changing files or URL suffixes. */
export function canonicalInternalPath(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return value;
  const suffixIndex = value.search(/[?#]/);
  const pathname = suffixIndex < 0 ? value : value.slice(0, suffixIndex);
  const suffix = suffixIndex < 0 ? '' : value.slice(suffixIndex);
  const finalSegment = pathname.slice(pathname.lastIndexOf('/') + 1);
  if (
    pathname === '/' ||
    pathname.endsWith('/') ||
    /\.[a-z\d]{1,10}$/i.test(finalSegment)
  )
    return value;
  return `${pathname}/${suffix}`;
}

/** Prefix same-site URLs for static hosting at a domain root or a subpath. */
export function sitePath(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return value;
  const base = (import.meta.env?.BASE_URL || '/').replace(/\/$/, '');
  return `${base}${canonicalInternalPath(value)}`;
}

/** Only render navigation URLs with safe protocols or absolute local paths. */
export function safeURL(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  if (value.startsWith('/') && !value.startsWith('//')) return sitePath(value);
  try {
    const url = new URL(value.trim());
    return ['https:', 'http:'].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

/** Use explicit CMS provenance when set; otherwise recognize preserved LibraryOn source URLs. */
export function isOriginalContent(entry) {
  if (entry.data.content_origin === 'libraryon') return true;
  if (entry.data.content_origin === 'commons') return false;
  try {
    return new URL(entry.data.source_url).hostname === 'libraryon.org';
  } catch {
    return false;
  }
}

/** Treat content as public unless an editor explicitly archives it. */
export function isPublishedPage(entry) {
  return entry.data.published !== false;
}

/** Prefer the article's own H1 over its old search-engine title. */
export function articleTitle(entry) {
  const heading = /^#\s+(.+)$/m.exec(entry.body || '')?.[1];
  const title = heading?.endsWith('  ') ? entry.data.title : heading || entry.data.title;
  return title
    .replace(/\s*\|\s*LibraryOn.*$/i, '')
    .replace(/[*_]/g, '')
    .trim();
}

/** Read the first locally preserved image for article previews. */
export function articleImage(entry) {
  if (entry.data.hero?.image) return { url: entry.data.hero.image, alt: entry.data.hero.alt };
  const image = /!\[([^\]]*)\]\((\/uploads\/[^\s)]+)\)/.exec(entry.body || '');
  return image ? { url: image[2], alt: image[1] } : null;
}

export const navigation = settings.navigation.length
  ? settings.navigation
  : [
      { label: 'Find a library', url: '/libraries/' },
      { label: 'Collections', url: '/special-collections/' },
      { label: 'Reading', url: '/reading/' },
      { label: 'Resources', url: '/resources/' },
      { label: 'Press Play', url: '/about/pressplay/' }
    ];

/** Format a date-only value as written, regardless of the viewer's timezone. */
export function formatDate(value) {
  return new Date(value).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC'
  });
}

export { settings };
