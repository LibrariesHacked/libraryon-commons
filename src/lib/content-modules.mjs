/**
 * @fileoverview Article HTML module splitting and resource link deduplication.
 */

import { load } from 'cheerio'
import { safeURL, mediaURL } from './site.mjs'

/**
 * Split rendered article HTML into modular content blocks around FAQ and resource markers.
 * @param {string} html - Rendered HTML from article markdown.
 * @param {{faqHeading?: string, base?: string, leadImage?: boolean}} [options={}] - Processing options.
 * @returns {Array<{type: 'html'|'faqs'|'resources', html?: string, headingId?: string, introduction?: string}>} Modular content blocks.
 */
export function splitContentModules(
  html,
  { faqHeading, base = import.meta.env?.BASE_URL || '/', leadImage = false } = {}
) {
  const document = load(html, null, false)
  const prefix = base.replace(/\/$/, '')
  if (leadImage) {
    for (const node of document.root().contents().toArray()) {
      const element = document(node)
      if (element.is('h2')) break
      if (!element.is('p') || element.text().trim()) continue
      const image = element.find('img').first()
      if (!image.length) continue
      const alt = image.attr('alt') || ''
      const src = image.attr('src') || ''
      if (/\b(?:logo|icon)\b/i.test(alt) || /\.svg(?:[?#]|$)/i.test(src)) {
        break
      }
      element.addClass('article-lead-image')
      break
    }
  }
  document('[src], [href], [poster]').each((index, node) => {
    const element = document(node)
    for (const attribute of ['src', 'href', 'poster']) {
      const value = element.attr(attribute)
      if (!value) continue
      const local = prefix && value.startsWith(`${prefix}/`) ? value.slice(prefix.length) : value
      const resolved = mediaURL(local)
      if (resolved !== local) element.attr(attribute, `${local === value ? '' : prefix}${resolved}`)
    }
  })
  const blocks = []
  const placed = new Set()
  const nodes = document.root().contents().toArray()
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index]
    const element = document(node)
    if (faqHeading && element.is('h2') && element.text().trim() === faqHeading) {
      let markerIndex = index + 1
      while (markerIndex < nodes.length) {
        const candidate = document(nodes[markerIndex])
        if (candidate.is('h2')) break
        if (
          candidate.is('p') &&
          candidate.children().length === 0 &&
          candidate.text().trim() === '{{faqs}}'
        ) {
          if (!placed.has('faqs')) {
            blocks.push({
              type: 'faqs',
              headingId: element.attr('id'),
              introduction: nodes
                .slice(index + 1, markerIndex)
                .map((child) => document.html(child))
                .join('')
            })
          }
          placed.add('faqs')
          index = markerIndex
          break
        }
        markerIndex += 1
      }
      if (index === markerIndex) continue
    }
    const marker =
      element.is('p') && element.children().length === 0
        ? /^\{\{(faqs|resources)\}\}$/.exec(element.text().trim())
        : null
    if (marker) {
      if (!placed.has(marker[1])) blocks.push({ type: marker[1] })
      placed.add(marker[1])
    } else {
      const markup = document.html(node)
      if (blocks.at(-1)?.type === 'html') blocks.at(-1).html += markup
      else blocks.push({ type: 'html', html: markup })
    }
  }
  for (const type of ['faqs', 'resources']) {
    if (!placed.has(type)) blocks.push({ type })
  }
  return blocks
}

/**
 * Filter resources to exclude URLs that are already linked directly in the article body.
 * @param {string} html - Article body HTML.
 * @param {Array<{url: string, [key: string]: unknown}>} resources - Candidate resources.
 * @returns {Array<{url: string, [key: string]: unknown}>} Resources not linked in body text.
 */
export function unlinkedResources(html, resources) {
  const document = load(html, null, false)
  const linked = new Set(
    document('a[href]')
      .toArray()
      .map((node) => safeURL(document(node).attr('href')))
  )
  return resources.filter((resource) => {
    const url = safeURL(resource.url)
    if (!url || linked.has(url)) return false
    linked.add(url)
    return true
  })
}
