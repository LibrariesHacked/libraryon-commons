/**
 * @fileoverview Dynamic XML sitemap route returning the Search Engine sitemap index of all published entries.
 */

import { getCollection } from 'astro:content'
import { authorities, libraries } from '../lib/directory.mjs'
import { isPublishedPage, settings } from '../lib/helpers/siteHelpers.mjs'
import { buildSitemapXml } from '../lib/helpers/seoHelpers.mjs'

export async function GET(context) {
  const siteUrl = (
    context.site ? context.site.href : settings.site.url || 'https://librarycommons.org.uk/'
  ).replace(/\/+$/, '')

  const [pageEntries, resources, sessions] = await Promise.all([
    getCollection('pages'),
    getCollection('resources'),
    getCollection('sessions')
  ])

  const publishedPages = pageEntries.filter((entry) => isPublishedPage(entry))

  const xml = buildSitemapXml({
    siteUrl,
    pages: publishedPages,
    resources,
    sessions,
    authorities,
    libraries
  })

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8'
    }
  })
}
