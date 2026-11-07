/**
 * @fileoverview Structured Schema.org metadata generators and social share URL formatting for search engine optimization.
 */

import settings from '../../data/settings.json' with { type: 'json' }

const DAY_SCHEMA_MAP = {
  monday: 'https://schema.org/Monday',
  tuesday: 'https://schema.org/Tuesday',
  wednesday: 'https://schema.org/Wednesday',
  thursday: 'https://schema.org/Thursday',
  friday: 'https://schema.org/Friday',
  saturday: 'https://schema.org/Saturday',
  sunday: 'https://schema.org/Sunday'
}

/**
 * Build absolute URL using site base URL.
 *
 * @param {string} [path=''] - Relative path or URL.
 * @param {string} [siteUrl=settings.site.url] - Site base URL.
 * @returns {string} Fully qualified absolute URL.
 */
export function absoluteUrl(path = '', siteUrl = settings.site.url) {
  if (!path) return siteUrl
  if (/^https?:\/\//i.test(path)) return path
  const base = (siteUrl || 'https://librarycommons.org.uk/').replace(/\/+$/, '')
  const cleanPath = path.startsWith('/') ? path : `/${path}`
  return `${base}${cleanPath}`
}

/**
 * Generate Schema.org Organization descriptor for the site.
 *
 * @param {string} [siteUrl=settings.site.url] - Base site URL.
 * @returns {object} Schema.org Organization object.
 */
export function generateOrganizationSchema(siteUrl = settings.site.url) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: settings.site.title,
    url: absoluteUrl('/', siteUrl),
    logo: absoluteUrl('/brand/icon-1024.png', siteUrl)
  }
}

/**
 * Generate Schema.org WebSite descriptor including search action.
 *
 * @param {string} [siteUrl=settings.site.url] - Base site URL.
 * @returns {object} Schema.org WebSite object.
 */
export function generateWebSiteSchema(siteUrl = settings.site.url) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: settings.site.title,
    url: absoluteUrl('/', siteUrl),
    description: settings.site.description,
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${absoluteUrl('/libraries/', siteUrl)}?query={search_term_string}`
      },
      'query-input': 'required name=search_term_string'
    }
  }
}

/**
 * Generate Schema.org BreadcrumbList descriptor.
 *
 * @param {Array<{label: string, href?: string}>} [breadcrumbs=[]] - Breadcrumb items.
 * @param {string} [siteUrl=settings.site.url] - Base site URL.
 * @returns {object|null} Schema.org BreadcrumbList object or null if empty.
 */
export function generateBreadcrumbSchema(breadcrumbs = [], siteUrl = settings.site.url) {
  if (!Array.isArray(breadcrumbs) || breadcrumbs.length === 0) return null
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: breadcrumbs.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: crumb.label,
      ...(crumb.href ? { item: absoluteUrl(crumb.href, siteUrl) } : {})
    }))
  }
}

/**
 * Generate Schema.org Article descriptor for editorial pages.
 *
 * @param {object} options - Article metadata.
 * @param {string} options.title - Article headline.
 * @param {string} [options.description] - Article summary.
 * @param {string} options.url - Canonical page URL.
 * @param {string} [options.imageUrl] - Featured article image URL.
 * @param {Date|string} [options.publishedOn] - Date published.
 * @param {Date|string} [options.updatedOn] - Date updated.
 * @param {string} [options.author] - Author name.
 * @param {string} [siteUrl=settings.site.url] - Base site URL.
 * @returns {object} Schema.org Article object.
 */
export function generateArticleSchema(
  { title, description, url, imageUrl, publishedOn, updatedOn, author },
  siteUrl = settings.site.url
) {
  const published = publishedOn ? new Date(publishedOn).toISOString() : undefined
  const updated = updatedOn ? new Date(updatedOn).toISOString() : published

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: title,
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': absoluteUrl(url, siteUrl)
    },
    publisher: generateOrganizationSchema(siteUrl)
  }

  if (description) schema.description = description
  if (imageUrl) schema.image = absoluteUrl(imageUrl, siteUrl)
  if (published) schema.datePublished = published
  if (updated) schema.dateModified = updated

  if (author) {
    schema.author = {
      '@type': 'Person',
      name: author
    }
  }

  return schema
}

/**
 * Generate Schema.org PublicLibrary descriptor for directory records.
 *
 * @param {object} library - Library model instance.
 * @param {object} [authority] - Authority model instance.
 * @param {string} canonicalUrl - Canonical page URL.
 * @returns {object} Schema.org PublicLibrary object.
 */
export function generateLibrarySchema(library, authority, canonicalUrl) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'PublicLibrary',
    name: library.name,
    description: `${library.name}${authority?.name ? ` in ${authority.name}` : ''}. ${library.address || ''}`,
    url: library.website || canonicalUrl,
    isAccessibleForFree: true,
    publicAccess: true
  }

  if (library.address || library.postcode) {
    schema.address = {
      '@type': 'PostalAddress',
      ...(library.address ? { streetAddress: library.address } : {}),
      ...(library.postcode ? { postalCode: library.postcode } : {}),
      addressCountry: 'GB'
    }
  }

  if (library.hasCoordinates) {
    schema.geo = {
      '@type': 'GeoCoordinates',
      latitude: library.latitude,
      longitude: library.longitude
    }
  }

  if (library.phone) schema.telephone = library.phone
  if (library.email) schema.email = library.email

  // Opening hours specification
  if (library.openingTimes && typeof library.openingTimes === 'object') {
    const specs = []
    for (const [day, dayData] of Object.entries(library.openingTimes)) {
      const dayUri = DAY_SCHEMA_MAP[day.toLowerCase()]
      if (!dayUri || !Array.isArray(dayData.timeFrames)) continue
      for (const slot of dayData.timeFrames) {
        if (slot.startTime && slot.endTime) {
          specs.push({
            '@type': 'OpeningHoursSpecification',
            dayOfWeek: dayUri,
            opens: slot.startTime,
            closes: slot.endTime
          })
        }
      }
    }
    if (specs.length > 0) schema.openingHoursSpecification = specs
  }

  return schema
}

/**
 * Generate social share links for Twitter, Facebook, LinkedIn, and Email.
 *
 * @param {object} options - Page share information.
 * @param {string} options.url - Full page URL.
 * @param {string} options.title - Page title.
 * @param {string} [options.description] - Page summary.
 * @returns {Record<string, string>} Social share URLs.
 */
export function buildShareUrls({ url, title, description = '' }) {
  const encodedUrl = encodeURIComponent(url)
  const encodedTitle = encodeURIComponent(title)
  const emailBody = encodeURIComponent(description ? `${description}\n\n${url}` : url)

  return {
    twitter: `https://twitter.com/intent/tweet?text=${encodedTitle}&url=${encodedUrl}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
    email: `mailto:?subject=${encodedTitle}&body=${emailBody}`
  }
}

/**
 * XML escape helper for URL locations.
 *
 * @param {string} value - Raw string.
 * @returns {string} XML safe string.
 */
export function escapeXml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * Format Date to ISO YYYY-MM-DD.
 *
 * @param {Date|string} [date] - Input date.
 * @returns {string|null} ISO date string.
 */
export function formatIsoDate(date) {
  if (!date) return null
  try {
    const parsed = new Date(date)
    return isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10)
  } catch {
    return null
  }
}

/**
 * Build a standard Search Engine sitemap XML document.
 *
 * @param {object} options - Sitemap generation options.
 * @param {string} [options.siteUrl=settings.site.url] - Canonical site base URL.
 * @param {Array<{data: {path: string, updated_on?: Date|string, published_on?: Date|string}}>} [options.pages=[]] - Published content pages.
 * @param {Array<{id: string, data?: {slug?: string}}>} [options.resources=[]] - Published resources.
 * @param {Array<{id: string, data?: {slug?: string}}>} [options.sessions=[]] - Conference sessions.
 * @param {Array<{slug: string}>} [options.authorities=[]] - Authorities list.
 * @param {Array<{url: string, updated_on?: string, reviewed_on?: string, permanentlyClosed?: boolean}>} [options.libraries=[]] - Libraries list.
 * @returns {string} XML string.
 */
export function buildSitemapXml({
  siteUrl = settings.site.url,
  pages = [],
  resources = [],
  sessions = [],
  authorities = [],
  libraries = []
}) {
  const base = (siteUrl || 'https://librarycommons.org.uk/').replace(/\/+$/, '')
  const entries = []
  const seenUrls = new Set()

  function addUrl(path, { lastmod, changefreq = 'weekly', priority = 0.7 } = {}) {
    const cleanPath = path.startsWith('/') ? path : `/${path}`
    const fullUrl = `${base}${cleanPath}`
    if (seenUrls.has(fullUrl)) return
    seenUrls.add(fullUrl)

    entries.push({
      loc: fullUrl,
      lastmod: formatIsoDate(lastmod),
      changefreq,
      priority
    })
  }

  // 1. Homepage & Core Discover Pages
  addUrl('/', { changefreq: 'daily', priority: 1.0 })
  addUrl('/libraries/', { changefreq: 'daily', priority: 0.9 })
  addUrl('/sitemap/', { changefreq: 'weekly', priority: 0.5 })

  // 2. Published Content Pages
  for (const page of pages) {
    if (page?.data?.path === '/libraries') continue
    if (!page?.data?.path) continue
    const lastmod = page.data.updated_on || page.data.published_on
    addUrl(page.data.path, {
      lastmod,
      changefreq: 'weekly',
      priority: 0.8
    })
  }

  // 3. Resources
  for (const resource of resources) {
    const slug = resource?.data?.slug || resource?.id
    if (slug) {
      addUrl(`/resources/${slug}/`, {
        changefreq: 'monthly',
        priority: 0.6
      })
    }
  }

  // 4. Sessions
  for (const session of sessions) {
    const slug = session?.data?.slug || session?.id
    if (slug) {
      addUrl(`/sessions/${slug}/`, {
        changefreq: 'monthly',
        priority: 0.6
      })
    }
  }

  // 5. Authorities
  for (const authority of authorities) {
    if (authority?.slug) {
      addUrl(`/libraries/${authority.slug}/`, {
        changefreq: 'weekly',
        priority: 0.8
      })
    }
  }

  // 6. Libraries
  for (const library of libraries) {
    if (library?.url) {
      const lastmod = library.updated_on || library.reviewed_on
      addUrl(library.url, {
        lastmod,
        changefreq: library.permanentlyClosed ? 'monthly' : 'weekly',
        priority: library.permanentlyClosed ? 0.4 : 0.8
      })
    }
  }

  const xmlUrls = entries
    .map((item) => {
      const parts = [`    <loc>${escapeXml(item.loc)}</loc>`]
      if (item.lastmod) parts.push(`    <lastmod>${item.lastmod}</lastmod>`)
      if (item.changefreq) parts.push(`    <changefreq>${item.changefreq}</changefreq>`)
      if (item.priority !== undefined)
        parts.push(`    <priority>${item.priority.toFixed(1)}</priority>`)
      return `  <url>\n${parts.join('\n')}\n  </url>`
    })
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${xmlUrls}\n</urlset>`
}
