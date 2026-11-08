/**
 * @fileoverview Resource reference tracking across editorial pages and conference sessions.
 */

import { articleTitle } from '../site/siteHelpers.mjs'

/**
 * Build a lookup map of where each downloadable resource is referenced across published pages and sessions.
 *
 * @param {Array<{id: string}>} resources - Collection of resources.
 * @param {Array<{data: {published?: boolean, path: string, resources?: string[]}}>} pages - Content pages.
 * @param {Array<{id: string, data: {title: string, resources?: string[]}}>} sessions - Conference sessions.
 * @returns {Map<string, Array<{label: string, href: string}>>} Map of resource ID to referencing pages.
 */
export function resourceUsage(resources, pages, sessions) {
  const usage = new Map(resources.map(({ id }) => [id, []]))

  for (const page of pages) {
    if (page.data.published === false) continue
    for (const id of page.data.resources || []) {
      usage.get(id)?.push({
        label: articleTitle(page),
        href: page.data.path
      })
    }
  }

  for (const session of sessions) {
    for (const id of session.data.resources || []) {
      usage.get(id)?.push({
        label: session.data.title,
        href: `/sessions/${session.id}/`
      })
    }
  }

  return usage
}
