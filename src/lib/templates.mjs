/**
 * @fileoverview Layout template resolution based on content entry path and kind.
 */

/**
 * Select a named presentation template without changing original content metadata.
 * @param {{data: {path: string, kind: string}}} entry - Content collection entry.
 * @returns {'home'|'grant'|'legal'|'article'|string} Template identifier.
 */
export function templateFor(entry) {
  if (entry.data.path === '/') return 'home'
  if (entry.data.kind !== 'page') return entry.data.kind
  if (entry.data.path.startsWith('/archive/grants')) return 'grant'
  if (entry.data.path.startsWith('/legal/')) return 'legal'
  return 'article'
}
