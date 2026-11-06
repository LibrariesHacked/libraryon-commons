/**
 * @fileoverview Directory assembly, validation, map links, and spatial proximity calculations.
 */

import { validateRecords } from './directory-schema.mjs'
import { Library, LibraryService, distanceMiles, compactOpeningHours } from './directory-models.mjs'

export { Library, LibraryService, distanceMiles, compactOpeningHours }

/**
 * Return the formatted address string for a library.
 * @param {object|Library} library - Library record.
 * @returns {string} Address string or empty string.
 */
export function libraryAddress(library) {
  return library?.address || ''
}

const facilityLabels = {
  'step-free-access': 'Step-free access',
  'sensory-friendly-environment': 'Sensory-friendly environment',
  'dda-compliant': 'DDA-compliant',
  school_college: 'School or college',
  uni_he: 'University or higher education'
}

/**
 * Format data identifiers without inventing facilities or accessibility claims.
 * @param {string} value - Machine-readable facility identifier.
 * @returns {string} Human-readable facility label.
 */
export function facilityLabel(value) {
  return (
    facilityLabels[value] ||
    String(value)
      .replace(/[-_]/g, ' ')
      .replace(/^./, (initial) => initial.toUpperCase())
  )
}

const operatingLabels = {
  'Local Authority Run': 'Local authority staffed',
  'Local Authority Run Unstaffed': 'Local authority run, unstaffed',
  'Community Run': 'Community-run',
  'Independent Community': 'Community-run',
  Commissioned: 'Commissioned',
  'Temporary Closure': 'Temporarily closed',
  'Facility Not Open': 'Closed/Not open',
  Closed: 'Permanently closed'
}

/**
 * Describe who runs a library using the original site's wording.
 * @param {string} value - Machine-readable operating model code or label.
 * @returns {string} Human-readable operating model description.
 */
export function operatingModelLabel(value) {
  return operatingLabels[value] || value || ''
}

/**
 * Build map links from the library, falling back to coordinates only where needed.
 * @param {object|Library} library - Library record with address and coordinates.
 * @returns {{google: string, apple: string}|null} Map links or null if coordinates/address are missing.
 */
export function mapLinks(library) {
  if (library instanceof Library) return library.mapLinks
  const address = libraryAddress(library)
  const hasPoint = Number.isFinite(library?.latitude) && Number.isFinite(library?.longitude)
  if (!address && !hasPoint) return null
  const point = `${library.latitude},${library.longitude}`
  return {
    google: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
      hasPoint && !address ? point : `library ${address}`
    )}`,
    apple: hasPoint
      ? `https://maps.apple.com/?ll=${point}`
      : `https://maps.apple.com/?q=${encodeURIComponent(address)}`
  }
}

/**
 * Return the unique values of a field across records, in first-seen order.
 * @template T
 * @param {T[]} records - Array of records to process.
 * @param {(record: T) => unknown[]} read - Function extracting an array of values from each record.
 * @returns {unknown[]} Array of unique values in first-seen order.
 */
export function collectValues(records, read) {
  const seen = new Set()
  for (const record of records) for (const value of read(record) || []) seen.add(value)
  return [...seen]
}

/**
 * Find the closest open libraries to one library, by straight-line distance.
 * @param {object} library - Library with latitude and longitude.
 * @param {object[]} candidates - All directory libraries.
 * @param {number} [count=5] - Number of neighbours to return.
 * @returns {Array<{library: object, miles: number}>} Nearest first.
 */
export function nearbyLibraries(library, candidates, count = 5) {
  if (library instanceof Library) return library.nearby(candidates, count)
  if (!Number.isFinite(library?.latitude) || !Number.isFinite(library?.longitude)) return []
  const nearest = []
  for (const other of candidates) {
    if (other.id === library.id || other.permanentlyClosed) continue
    const miles = distanceMiles(library, other)
    if (miles === null) continue
    if (nearest.length === count && miles >= nearest[count - 1].miles) continue
    nearest.push({ library: other, miles })
    nearest.sort((first, second) => first.miles - second.miles)
    if (nearest.length > count) nearest.pop()
  }
  return nearest
}

/**
 * Assemble a validated directory from individual library and authority records.
 * Relationships come from the editable authority field, never stale source ID lists.
 * @param {object[]} authorityRecords - Editable authorities.
 * @param {object[]} libraryRecords - Individually editable libraries.
 * @param {{requireCanonical?: boolean}} [options] - Reject legacy fixtures in production.
 * @returns {object} Directory records, stable paths and a minimal browser search index.
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
  authorityRecords = authorityRecords.map((record) =>
    record instanceof LibraryService ? record : new LibraryService(record)
  )
  libraryRecords = libraryRecords.map((record) =>
    record instanceof Library ? record : new Library(record)
  )
  const authorities = [...authorityRecords].sort((first, second) =>
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
  /** @param {object} record - Presentation record to register with unique routing and authority membership. */
  const addLibrary = (record) => {
    const slug = record.authority || ''
    if (!record.name || !/^[A-Za-z0-9][A-Za-z0-9-]*$/.test(record.slug || '')) {
      throw new Error(`Invalid library name or slug: ${record.name || '(unnamed)'}`)
    }
    const authority = slug ? bySlug.get(slug) : null
    if (slug && !authority) throw new Error(`Unknown authority ${slug} for ${record.name}`)
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
  for (const library of libraryRecords) addLibrary(library)
  /** @param {{url: string}} library - Registered library. @returns {string} Stable public route. */
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
