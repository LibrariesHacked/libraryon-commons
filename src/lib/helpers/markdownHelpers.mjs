/**
 * @fileoverview Markdown Rehype AST plugins for link preservation, Cloudflare email decoding, and list indentation formatting.
 */

import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkDirective from 'remark-directive'
import { canonicalInternalPath, mediaURL } from './siteHelpers.mjs'

/**
 * Standard options for mdast-util-to-markdown serialization.
 */
export const markdownOptions = {
  bullet: '-',
  listItemIndent: 'one',
  emphasis: '*',
  strong: '*',
  fences: true
}

/**
 * Decode Cloudflare email protection tokens into standard mailto: URLs.
 *
 * @param {string} value - String or URL potentially containing a Cloudflare email token.
 * @returns {string} Standard `mailto:` URL or original string if not protected.
 */
export function decodeProtectedEmail(value) {
  if (typeof value !== 'string' || !value.includes('/cdn-cgi/l/email-protection#')) {
    return value
  }
  const token = value.split('#')[1]
  if (!/^[\da-f]+$/i.test(token) || token.length < 4 || token.length % 2) {
    return value
  }
  const bytes = Buffer.from(token, 'hex')
  const decoded = Buffer.from(bytes.subarray(1).map((byte) => byte ^ bytes[0])).toString('utf8')
  if (!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(decoded.split('?')[0])) {
    return value
  }
  return `mailto:${decoded}`
}

/**
 * Rehype plugin to preserve internal links, normalize media URLs, and decode Cloudflare-obfuscated email links.
 *
 * @param {{base?: string}} [options={}] - Base path options for relative deployments.
 * @returns {(tree: object) => void} AST transformer function.
 */
export function preservedLinks({ base = '/' } = {}) {
  const prefix = base.replace(/\/$/, '')
  return (tree) => {
    function normalizeLinks(node) {
      if (node.type === 'element' && node.properties) {
        if (node.tagName === 'img' && /^https?:/.test(node.properties.src || '')) {
          node.tagName = 'a'
          node.children = [
            {
              type: 'text',
              value: node.properties.src
                ? node.properties.alt || 'Original image'
                : 'Original image'
            }
          ]
          node.properties = { href: node.properties.src }
        }
        for (const attribute of ['href', 'src', 'poster']) {
          let value = node.properties[attribute]
          if (typeof value !== 'string') continue
          value = decodeProtectedEmail(value)
          value = mediaURL(value)
          if (value.startsWith('/www.equalityadvisoryservice.com')) {
            value = `https:/${value}`
          }
          if (attribute === 'href') {
            value = canonicalInternalPath(value)
          }
          if (
            prefix &&
            value.startsWith('/') &&
            !value.startsWith('//') &&
            !value.startsWith(`${prefix}/`)
          ) {
            value = `${prefix}${value}`
          }
          node.properties[attribute] = value
        }
      }
      for (const child of node.children || []) {
        normalizeLinks(child)
      }
    }
    normalizeLinks(tree)
  }
}

/**
 * Normalize Markdown list markers to use a single space indentation after list bullets/numbers.
 *
 * @param {string} source - Markdown source text.
 * @returns {string} Normalized Markdown string.
 */
export function normalizeListSpacing(source) {
  const tree = unified().use(remarkParse).use(remarkDirective).parse(source)
  const edits = []
  const indentation = new Map()
  const visit = (node) => {
    if (node.type === 'listItem') {
      const start = node.position.start.offset
      const marker = /^([-+*]|\d+[.)])( {2,})/.exec(source.slice(start))
      if (marker) {
        const surplus = marker[2].length - 1
        edits.push({
          start: start + marker[1].length + 1,
          end: start + marker[0].length,
          value: ''
        })
        const threshold = node.position.start.column - 1 + marker[0].length
        let line = source.indexOf('\n', start) + 1
        while (line > 0 && line < node.position.end.offset) {
          const spaces = /^ */.exec(source.slice(line))[0].length
          if (spaces >= threshold) {
            indentation.set(line, (indentation.get(line) || 0) + surplus)
          }
          const next = source.indexOf('\n', line)
          line = next < 0 ? 0 : next + 1
        }
      }
    }
    ;(node.children || []).forEach(visit)
  }
  visit(tree)
  for (const [start, count] of indentation) {
    edits.push({ start, end: start + count, value: '' })
  }
  for (const edit of edits.sort((first, second) => second.start - first.start)) {
    source = `${source.slice(0, edit.start)}${edit.value}${source.slice(edit.end)}`
  }
  return source
}
