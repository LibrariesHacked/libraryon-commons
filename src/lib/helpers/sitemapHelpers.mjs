/**
 * @fileoverview Recursive navigation tree builder converting flat published routes into a nested sitemap hierarchy.
 */

import { articleTitle } from './siteHelpers.mjs'

/**
 * Convert a URL path segment into a title-cased fallback label.
 *
 * @param {string} segment - URL path segment (e.g. "special-collections").
 * @returns {string} Formatted label (e.g. "Special Collections").
 */
const segmentLabel = (segment) =>
  segment.replace(/[-_]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())

/**
 * Build a nested navigation tree representing page hierarchy from flat page entries.
 *
 * @param {Array<{data: {path: string, title: string}, body?: string}>} pages - Collection of content pages.
 * @returns {Array<{label: string, href: string|null, children: Array<object>}>} Nested tree of sitemap nodes.
 */
export function buildPageTree(pages) {
  const root = { children: [], lookup: new Map() }

  for (const page of pages) {
    const path = page.data.path.replace(/\/+$/, '') || '/'
    const segments = path.split('/').filter(Boolean)
    let parent = root
    let currentPath = ''

    for (const segment of segments) {
      currentPath += `/${segment}`
      let node = parent.lookup.get(segment)
      if (!node) {
        node = {
          label: segmentLabel(segment),
          href: null,
          children: [],
          lookup: new Map()
        }
        parent.lookup.set(segment, node)
        parent.children.push(node)
      }
      if (currentPath === path) {
        node.label = articleTitle(page)
        node.href = page.data.path
      }
      parent = node
    }
  }

  const sort = (nodes) => {
    nodes.sort((first, second) => first.label.localeCompare(second.label, 'en'))
    for (const node of nodes) {
      delete node.lookup
      sort(node.children)
    }
  }
  sort(root.children)
  return root.children
}
