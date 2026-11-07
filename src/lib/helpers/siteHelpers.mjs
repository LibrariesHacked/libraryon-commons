/**
 * @fileoverview Global site configuration, URL canonicalization, safe protocol verification, and date formatting.
 */

import settings from '../../data/settings.json' with { type: 'json' }
import mediaMasters from '../../data/media-masters.json' with { type: 'json' }

/**
 * Resolve a media path against preserved master media aliases.
 *
 * @param {string} value - Media path or URL.
 * @param {Record<string, {url: string}>} [aliases=mediaMasters.aliases] - Aliases dictionary.
 * @returns {string} Resolved media URL.
 */
export function mediaURL(value, aliases = mediaMasters.aliases) {
  if (typeof value !== 'string') return value
  const suffixIndex = value.search(/[?#]/)
  const pathname = suffixIndex < 0 ? value : value.slice(0, suffixIndex)
  const suffix = suffixIndex < 0 ? '' : value.slice(suffixIndex)
  return `${aliases[pathname]?.url || pathname}${suffix}`
}

/**
 * Canonicalize extensionless internal routes with a trailing slash without altering query suffixes.
 *
 * @param {string} value - Input path or URL.
 * @returns {string} Canonicalized path with trailing slash.
 */
export function canonicalInternalPath(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return value
  const suffixIndex = value.search(/[?#]/)
  const pathname = suffixIndex < 0 ? value : value.slice(0, suffixIndex)
  const suffix = suffixIndex < 0 ? '' : value.slice(suffixIndex)
  const finalSegment = pathname.slice(pathname.lastIndexOf('/') + 1)
  if (pathname === '/' || pathname.endsWith('/') || /\.[a-z\d]{1,10}$/i.test(finalSegment)) {
    return value
  }
  return `${pathname}/${suffix}`
}

/**
 * Prefix same-site URLs for static hosting at domain root or custom subpaths.
 *
 * @param {string} value - Absolute local path.
 * @returns {string} Base-prefixed URL path.
 */
export function sitePath(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return value
  const base = (import.meta.env?.BASE_URL || '/').replace(/\/$/, '')
  return `${base}${canonicalInternalPath(mediaURL(value))}`
}

/**
 * Sanitize URLs to ensure only safe web protocols (http, https) or valid internal relative paths render.
 *
 * @param {string} value - Candidate URL string.
 * @returns {string|null} Safe URL string or null.
 */
export function safeURL(value) {
  if (typeof value !== 'string' || !value.trim()) return null
  if (value.startsWith('/') && !value.startsWith('//')) return sitePath(value)
  try {
    const url = new URL(value.trim())
    return ['https:', 'http:'].includes(url.protocol) ? url.href : null
  } catch {
    return null
  }
}

/**
 * Determine whether a content entry originated from the preserved LibraryOn site.
 *
 * @param {{data: {content_origin?: string, source_url?: string}}} entry - Content entry.
 * @returns {boolean} True if original LibraryOn content.
 */
export function isOriginalContent(entry) {
  if (entry.data.content_origin === 'libraryon') return true
  if (entry.data.content_origin === 'commons') return false
  try {
    return new URL(entry.data.source_url).hostname === 'libraryon.org'
  } catch {
    return false
  }
}

/**
 * Check whether a content entry is published and visible on the public site.
 *
 * @param {{data: {published?: boolean}}} entry - Content entry.
 * @returns {boolean} True if published.
 */
export function isPublishedPage(entry) {
  return entry.data.published !== false
}

/**
 * Clean and resolve the primary title for an article entry, preferring the markdown H1.
 *
 * @param {{body?: string, data: {title: string}}} entry - Article content entry.
 * @returns {string} Clean article title.
 */
export function articleTitle(entry) {
  const heading = /^#\s+(.+)$/m.exec(entry.body || '')?.[1]
  const title = heading?.endsWith('  ') ? entry.data.title : heading || entry.data.title
  return title
    .replace(/\s*\|\s*LibraryOn.*$/i, '')
    .replace(/[*_]/g, '')
    .trim()
}

/**
 * Build a breadcrumb trail from published pages that are actual route ancestors.
 *
 * @param {{data: {path: string, title: string}, body?: string}} entry - Current page entry.
 * @param {Array<{data: {path: string, title: string}, body?: string}>} [pages=[]] - All pages.
 * @param {string} [homeLabel=settings.ui.editorial.home_breadcrumb] - Label for home breadcrumb.
 * @returns {Array<{label: string, href?: string, current?: boolean}>} Breadcrumb items.
 */
export function breadcrumbsForPage(
  entry,
  pages = [],
  homeLabel = settings.ui.editorial.home_breadcrumb
) {
  const normalizePath = (value) => {
    const segments = String(value || '')
      .split('/')
      .filter(Boolean)
    return segments.length ? `/${segments.join('/')}` : '/'
  }
  const currentPath = normalizePath(entry.data.path)
  if (currentPath === '/') return []

  const pagesByPath = new Map(pages.map((page) => [normalizePath(page.data.path), page]))
  const segments = currentPath.split('/').filter(Boolean)
  const ancestors = []
  for (let length = 1; length < segments.length; length += 1) {
    const path = `/${segments.slice(0, length).join('/')}`
    const page = pagesByPath.get(path)
    if (page) ancestors.push({ label: articleTitle(page), href: page.data.path })
  }

  return [
    { label: homeLabel, href: '/' },
    ...ancestors,
    { label: articleTitle(entry), current: true }
  ]
}

/**
 * Read the first locally preserved image for article previews.
 *
 * @param {{body?: string, data: {hero?: {image: string, alt?: string}}}} entry - Content entry.
 * @returns {{url: string, alt?: string}|null} Image details or null.
 */
export function articleImage(entry) {
  if (entry.data.hero?.image) return { url: entry.data.hero.image, alt: entry.data.hero.alt }
  const image = /!\[([^\]]*)\]\((\/uploads\/[^\s)]+)\)/.exec(entry.body || '')
  return image ? { url: image[2], alt: image[1] } : null
}

export const navigation = settings.navigation.length
  ? settings.navigation
  : [
      { label: 'Find a library', url: '/libraries/' },
      { label: 'Collections', url: '/special-collections/' },
      { label: 'Reading', url: '/reading/' },
      { label: 'Resources', url: '/resources/' },
      { label: 'Press Play', url: '/about/pressplay/' }
    ]

/**
 * Format a date value in British English using UTC to prevent timezone shifts.
 *
 * @param {string|number|Date} value - Date value.
 * @returns {string} Formatted date string (e.g. '7 November 2026').
 */
export function formatDate(value) {
  return new Date(value).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC'
  })
}

export { settings }
