/**
 * @fileoverview Directory collection validation, graph assembly linking libraries to authorities, and breadcrumb trails.
 */

import { Library } from '../models/Library.mjs'
import { LibraryService } from '../models/LibraryService.mjs'
import { libraryAddress } from './dataHelpers.mjs'
import { compactOpeningHours } from './openingHoursHelpers.mjs'
import { validateRecords } from './schemaHelpers.mjs'
import { settings } from './siteHelpers.mjs'

/**
 * Assemble a validated directory graph from individual library and authority records.
 *
 * @param {object[]} authorityRecords - Local authority records.
 * @param {object[]} libraryRecords - Library records.
 * @param {{requireCanonical?: boolean}} [options] - Whether to enforce strict schema validation.
 * @returns {{libraries: Library[], authorities: LibraryService[], authorityByLibrary: Map<string, LibraryService>, libraryPath: (library: Library) => string, searchRecords: object[]}} Assembled directory graph.
 */
export function createDirectory(
  authorityRecords,
  libraryRecords,
  { requireCanonical = false } = {}
) {
  validateRecords(
    requireCanonical ? authorityRecords : authorityRecords.filter((record) => record.data),
    'authorities'
  )
  validateRecords(
    requireCanonical ? libraryRecords : libraryRecords.filter((record) => record.data),
    'libraries'
  )

  const wrappedAuthorities = authorityRecords.map((record) =>
    record instanceof LibraryService ? record : new LibraryService(record)
  )
  const wrappedLibraries = libraryRecords.map((record) =>
    record instanceof Library ? record : new Library(record)
  )

  const authorities = [...wrappedAuthorities].sort((first, second) =>
    first.name.localeCompare(second.name, 'en')
  )

  const bySlug = new Map()
  for (const authority of authorities) {
    if (!/^[A-Za-z0-9][A-Za-z0-9-]*$/.test(authority.slug || '') || bySlug.has(authority.slug)) {
      throw new Error(`Missing or duplicate authority slug: ${authority.slug}`)
    }
    authority.library_ids = []
    bySlug.set(authority.slug, authority)
  }

  const authorityByLibrary = new Map()
  const paths = new Set()
  const ids = new Set()
  const libraries = []

  const addLibrary = (record) => {
    const slug = record.authority || ''
    if (!record.name || !/^[A-Za-z0-9][A-Za-z0-9-]*$/.test(record.slug || '')) {
      throw new Error(`Invalid library name or slug: ${record.name || '(unnamed)'}`)
    }
    const authority = slug ? bySlug.get(slug) : null
    if (slug && !authority) {
      throw new Error(`Unknown authority ${slug} for ${record.name}`)
    }
    const id = record.id || `${slug || 'unassigned'}/${record.slug}`
    const url = `/libraries/${slug || 'unassigned'}/${record.slug}/`
    if (ids.has(id) || paths.has(url)) {
      throw new Error(`Duplicate library ID or route: ${record.name}`)
    }
    ids.add(id)
    paths.add(url)
    const library = record instanceof Library ? record : new Library(record)
    library.id = id
    library.authority = slug
    library.url = url
    libraries.push(library)
    if (authority) {
      authorityByLibrary.set(id, authority)
      authority.library_ids.push(id)
    }
  }

  for (const library of wrappedLibraries) {
    addLibrary(library)
  }

  const libraryPath = (library) => library.url

  const searchRecords = libraries
    .map((library) => ({
      id: library.id,
      name: library.name,
      url: library.url,
      address: libraryAddress(library),
      postcode: library.postcode || '',
      town: library.town || '',
      authority: library.authority || 'unassigned',
      authorityName: authorityByLibrary.get(library.id)?.name || 'Authority not recorded',
      country: authorityByLibrary.get(library.id)?.country || '',
      services: (library.services || [])
        .map((item) => (typeof item === 'string' ? item : item?.service))
        .filter(Boolean),
      accessibility: library.accessibility || [],
      hours: compactOpeningHours(library.openingTimes),
      closed: Boolean(
        library.permanentlyClosed ||
        library.facilityOperated === 'Closed' ||
        library.facilityOperated === 'Facility Not Open'
      ),
      latitude: Number.isFinite(library.latitude) ? library.latitude : null,
      longitude: Number.isFinite(library.longitude) ? library.longitude : null
    }))
    .sort((first, second) => first.name.localeCompare(second.name, 'en'))

  return {
    libraries,
    authorities: [...bySlug.values()],
    authorityByLibrary,
    libraryPath,
    searchRecords
  }
}

/**
 * Build a breadcrumb navigation trail for directory pages.
 *
 * @param {string} title - Page title for the current breadcrumb.
 * @param {{name: string, slug: string}|null} [authority=null] - Optional parent authority.
 * @returns {Array<{label: string, href?: string, current?: boolean}>} Breadcrumb items.
 */
export function directoryBreadcrumbs(title, authority = null) {
  return [
    { label: settings.ui.editorial.home_breadcrumb, href: '/' },
    { label: settings.ui.directory.breadcrumb, href: '/libraries/' },
    ...(authority ? [{ label: authority.name, href: `/libraries/${authority.slug}/` }] : []),
    { label: title, current: true }
  ]
}
