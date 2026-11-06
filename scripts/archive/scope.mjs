/**
 * @fileoverview Domain and URL scope boundary definitions for archive collection and mirroring.
 */

export const origin = 'https://libraryon.org'
export const assetHost = 'libraryon.lon1.digitaloceanspaces.com'

/**
 * Check whether a URL falls within the allowed web archiving scope.
 * @param {string} url - Candidate URL.
 * @param {boolean} [api=false] - Whether to allow public read-only CMS API endpoints.
 * @returns {boolean} True if within authorized preservation scope.
 */
export function allowed(url, api = false) {
  const parsed = new URL(url)
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
    return false
  }
  if (parsed.hostname === assetHost) return true
  if (parsed.hostname === 'lon1.digitaloceanspaces.com') {
    return parsed.pathname.startsWith('/libraryon/')
  }
  if (parsed.origin !== origin) return false
  const pathname = decodeURIComponent(parsed.pathname)
  return !pathname.startsWith('/cms/') || (api && pathname.startsWith('/cms/api/'))
}
