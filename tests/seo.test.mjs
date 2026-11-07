/**
 * @fileoverview Automated tests for Schema.org structured data, Open Graph / Twitter Card tags, XML sitemap, and robots.txt.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import {
  absoluteUrl,
  generateOrganizationSchema,
  generateWebSiteSchema,
  generateBreadcrumbSchema,
  generateArticleSchema,
  generateLibrarySchema,
  buildShareUrls,
  buildSitemapXml
} from '../src/lib/helpers/seoHelpers.mjs'

test('absoluteUrl builds valid fully qualified URLs from relative and absolute paths', () => {
  assert.equal(absoluteUrl('/', 'https://example.com/'), 'https://example.com/')
  assert.equal(
    absoluteUrl('/libraries/manchester/', 'https://example.com/'),
    'https://example.com/libraries/manchester/'
  )
  assert.equal(
    absoluteUrl('brand/social-card.png', 'https://example.com'),
    'https://example.com/brand/social-card.png'
  )
  assert.equal(
    absoluteUrl('https://other.org/asset.jpg', 'https://example.com/'),
    'https://other.org/asset.jpg'
  )
})

test('generateOrganizationSchema produces valid Schema.org Organization', () => {
  const schema = generateOrganizationSchema('https://librarycommons.org.uk/')
  assert.equal(schema['@context'], 'https://schema.org')
  assert.equal(schema['@type'], 'Organization')
  assert.equal(schema.name, 'LibraryCommons')
  assert.equal(schema.url, 'https://librarycommons.org.uk/')
  assert.equal(schema.logo, 'https://librarycommons.org.uk/brand/icon-1024.png')
})

test('generateWebSiteSchema produces Schema.org WebSite with SearchAction', () => {
  const schema = generateWebSiteSchema('https://librarycommons.org.uk/')
  assert.equal(schema['@context'], 'https://schema.org')
  assert.equal(schema['@type'], 'WebSite')
  assert.equal(schema.potentialAction['@type'], 'SearchAction')
  assert.equal(schema.potentialAction['query-input'], 'required name=search_term_string')
  assert.ok(schema.potentialAction.target.urlTemplate.includes('/libraries/'))
})

test('generateBreadcrumbSchema maps breadcrumb items into Schema.org BreadcrumbList', () => {
  const breadcrumbs = [
    { label: 'Home', href: '/' },
    { label: 'Libraries', href: '/libraries/' },
    { label: 'Manchester Central Library' }
  ]
  const schema = generateBreadcrumbSchema(breadcrumbs, 'https://librarycommons.org.uk/')
  assert.equal(schema['@type'], 'BreadcrumbList')
  assert.equal(schema.itemListElement.length, 3)
  assert.equal(schema.itemListElement[0].position, 1)
  assert.equal(schema.itemListElement[0].name, 'Home')
  assert.equal(schema.itemListElement[0].item, 'https://librarycommons.org.uk/')
  assert.equal(schema.itemListElement[2].position, 3)
  assert.equal(schema.itemListElement[2].name, 'Manchester Central Library')
  assert.equal(schema.itemListElement[2].item, undefined)
})

test('generateArticleSchema outputs Schema.org Article descriptor with authors and publisher', () => {
  const schema = generateArticleSchema(
    {
      title: 'Connecting Readers in Rural Communities',
      description: 'How mobile library fleets provide vital community connections.',
      url: '/archive/stories/rural-communities/',
      imageUrl: '/uploads/archive/mobile-library.jpg',
      publishedOn: '2026-03-15T10:00:00Z',
      updatedOn: '2026-04-01T12:00:00Z',
      author: 'Jane Doe'
    },
    'https://librarycommons.org.uk/'
  )

  assert.equal(schema['@type'], 'Article')
  assert.equal(schema.headline, 'Connecting Readers in Rural Communities')
  assert.equal(
    schema.mainEntityOfPage['@id'],
    'https://librarycommons.org.uk/archive/stories/rural-communities/'
  )
  assert.equal(schema.image, 'https://librarycommons.org.uk/uploads/archive/mobile-library.jpg')
  assert.equal(schema.author.name, 'Jane Doe')
  assert.equal(schema.publisher['@type'], 'Organization')
  assert.equal(schema.datePublished, '2026-03-15T10:00:00.000Z')
  assert.equal(schema.dateModified, '2026-04-01T12:00:00.000Z')
})

test('generateLibrarySchema outputs Schema.org PublicLibrary descriptor with hours and geo coordinates', () => {
  const mockLibrary = {
    name: 'Jubilee Library',
    address: 'Jubilee Street, Brighton',
    postcode: 'BN1 1GE',
    latitude: 50.8256,
    longitude: -0.1388,
    hasCoordinates: true,
    phone: '01273 290800',
    email: 'libraries@brighton-hove.gov.uk',
    website: 'https://www.brighton-hove.gov.uk/libraries',
    openingTimes: {
      monday: {
        timeFrames: [{ startTime: '10:00', endTime: '19:00', type: 'Staffed' }]
      },
      tuesday: {
        timeFrames: [{ startTime: '10:00', endTime: '19:00', type: 'Staffed' }]
      }
    }
  }

  const mockAuthority = { name: 'Brighton and Hove' }
  const schema = generateLibrarySchema(
    mockLibrary,
    mockAuthority,
    'https://librarycommons.org.uk/libraries/brighton-and-hove/jubilee-library/'
  )

  assert.equal(schema['@type'], 'PublicLibrary')
  assert.equal(schema.name, 'Jubilee Library')
  assert.equal(schema.address['@type'], 'PostalAddress')
  assert.equal(schema.address.streetAddress, 'Jubilee Street, Brighton')
  assert.equal(schema.address.postalCode, 'BN1 1GE')
  assert.equal(schema.geo['@type'], 'GeoCoordinates')
  assert.equal(schema.geo.latitude, 50.8256)
  assert.equal(schema.geo.longitude, -0.1388)
  assert.equal(schema.telephone, '01273 290800')
  assert.equal(schema.email, 'libraries@brighton-hove.gov.uk')
  assert.equal(schema.url, 'https://www.brighton-hove.gov.uk/libraries')
  assert.ok(Array.isArray(schema.openingHoursSpecification))
  assert.equal(schema.openingHoursSpecification.length, 2)
  assert.equal(schema.openingHoursSpecification[0].dayOfWeek, 'https://schema.org/Monday')
  assert.equal(schema.openingHoursSpecification[0].opens, '10:00')
  assert.equal(schema.openingHoursSpecification[0].closes, '19:00')
})

test('buildShareUrls generates properly encoded share intents for major platforms', () => {
  const share = buildShareUrls({
    url: 'https://librarycommons.org.uk/reading/',
    title: 'Reading at Your Library',
    description: 'Find books and resources across the UK.'
  })

  assert.ok(share.twitter.includes('text=Reading%20at%20Your%20Library'))
  assert.ok(share.twitter.includes('url=https%3A%2F%2Flibrarycommons.org.uk%2Freading%2F'))
  assert.ok(share.facebook.includes('u=https%3A%2F%2Flibrarycommons.org.uk%2Freading%2F'))
  assert.ok(share.linkedin.includes('url=https%3A%2F%2Flibrarycommons.org.uk%2Freading%2F'))
  assert.ok(share.email.startsWith('mailto:?subject=Reading%20at%20Your%20Library'))
})

test('robots.txt exists and specifies crawl rules and sitemap location', () => {
  assert.ok(existsSync('public/robots.txt'))
  const content = readFileSync('public/robots.txt', 'utf8')
  assert.ok(content.includes('User-agent: *'))
  assert.ok(content.includes('Allow: /'))
  assert.ok(content.includes('Disallow: /admin/'))
  assert.ok(content.includes('Sitemap: https://librarycommons.org.uk/sitemap.xml'))
})

test('buildSitemapXml generates valid XML urlset containing core pages, authorities and libraries', () => {
  const xml = buildSitemapXml({
    siteUrl: 'https://librarycommons.org.uk/',
    pages: [{ data: { path: '/reading', updated_on: '2026-04-01' } }],
    resources: [{ id: 'res-1', data: { slug: 'free-wifi' } }],
    sessions: [{ id: 'sess-1', data: { slug: 'keynote' } }],
    authorities: [{ slug: 'manchester' }],
    libraries: [{ url: '/libraries/manchester/central-library/', updated_on: '2026-03-20' }]
  })

  assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'))
  assert.ok(xml.includes('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'))
  assert.ok(xml.includes('<loc>https://librarycommons.org.uk/</loc>'))
  assert.ok(xml.includes('<loc>https://librarycommons.org.uk/libraries/</loc>'))
  assert.ok(xml.includes('<loc>https://librarycommons.org.uk/sitemap/</loc>'))
  assert.ok(xml.includes('<loc>https://librarycommons.org.uk/reading</loc>'))
  assert.ok(xml.includes('<loc>https://librarycommons.org.uk/resources/free-wifi/</loc>'))
  assert.ok(xml.includes('<loc>https://librarycommons.org.uk/sessions/keynote/</loc>'))
  assert.ok(xml.includes('<loc>https://librarycommons.org.uk/libraries/manchester/</loc>'))
  assert.ok(
    xml.includes('<loc>https://librarycommons.org.uk/libraries/manchester/central-library/</loc>')
  )
  assert.ok(xml.includes('<lastmod>2026-04-01</lastmod>'))
  assert.ok(!xml.includes('/admin/'))
  assert.ok(xml.endsWith('</urlset>'))
})

test('SiteLayout template renders Open Graph, Twitter Card, and Schema.org tags', () => {
  const layout = readFileSync('src/layouts/SiteLayout.astro', 'utf8')
  assert.ok(layout.includes('og:title'))
  assert.ok(layout.includes('og:description'))
  assert.ok(layout.includes('og:image'))
  assert.ok(layout.includes('og:type'))
  assert.ok(layout.includes('twitter:card'))
  assert.ok(layout.includes('twitter:image'))
  assert.ok(layout.includes('type="application/ld+json"'))
})

test('ShareButtons component provides accessible buttons and progressive enhancement', () => {
  const share = readFileSync('src/components/ShareButtons.astro', 'utf8')
  assert.ok(share.includes('data-share-action="native"'))
  assert.ok(share.includes('data-share-action="copy"'))
  assert.ok(share.includes('src="../scripts/shareClient.mjs"'))
  assert.ok(share.includes('share-link'))
  assert.ok(!share.includes('text-transform: uppercase'))
})
