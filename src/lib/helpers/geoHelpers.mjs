/**
 * @fileoverview Geographic helpers for straight-line Haversine distance, navigation map links, nearest library lookups, and MapLibre GeoJSON feature generation.
 */

const toRadians = (degrees) => (degrees * Math.PI) / 180
const earthMiles = 3958.8

/**
 * Calculate the straight-line Haversine distance in miles between two coordinate points.
 * Returns null if either coordinate set is missing or non-numeric.
 *
 * @param {{latitude?: number|null, longitude?: number|null}} first - First coordinate point.
 * @param {{latitude?: number|null, longitude?: number|null}} second - Second coordinate point.
 * @returns {number|null} Distance in miles, or null if coordinates are invalid.
 */
export function distanceMiles(first, second) {
  if (
    !Number.isFinite(first?.latitude) ||
    !Number.isFinite(first?.longitude) ||
    !Number.isFinite(second?.latitude) ||
    !Number.isFinite(second?.longitude)
  ) {
    return null
  }
  const lat = toRadians(first.latitude)
  const otherLat = toRadians(second.latitude)
  const haversine =
    Math.sin((otherLat - lat) / 2) ** 2 +
    Math.cos(lat) *
      Math.cos(otherLat) *
      Math.sin(toRadians(second.longitude - first.longitude) / 2) ** 2
  return 2 * earthMiles * Math.asin(Math.sqrt(haversine))
}

/**
 * Build external navigation links for Google Maps and Apple Maps.
 * Prefers human-readable addresses for search queries and falls back to precise coordinates.
 *
 * @param {{address?: string, postcode?: string, latitude?: number|null, longitude?: number|null}} library - Library record.
 * @returns {{google: string, apple: string}|null} Map service URLs, or null if neither address nor point is available.
 */
export function mapLinks(library) {
  const address = library?.address || ''
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
 * Find the closest open libraries to a target library by straight-line distance.
 * Permanently closed libraries and the target library itself are automatically excluded.
 *
 * @param {{id?: string|number, latitude?: number|null, longitude?: number|null}} library - Target library.
 * @param {Array<{id?: string|number, permanentlyClosed?: boolean, latitude?: number|null, longitude?: number|null}>} candidates - Candidate libraries to evaluate.
 * @param {number} [count=5] - Maximum number of nearest neighbours to return.
 * @returns {Array<{library: object, miles: number}>} Nearest libraries sorted ascending by distance in miles.
 */
export function nearbyLibraries(library, candidates, count = 5) {
  if (typeof library?.nearby === 'function') {
    return library.nearby(candidates, count)
  }
  if (!Number.isFinite(library?.latitude) || !Number.isFinite(library?.longitude)) {
    return []
  }
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
 * Convert library records into a GeoJSON FeatureCollection for interactive MapLibre map views.
 *
 * @param {Array<{latitude?: number|null, longitude?: number|null, name?: string, address?: string, postcode?: string, url?: string, closed?: boolean, permanentlyClosed?: boolean, facilityOperated?: string}>} libraries - Library records.
 * @param {(path: string) => string} [resolvePath=(path) => path] - URL resolver function for local paths.
 * @returns {{type: 'FeatureCollection', features: Array<{type: 'Feature', geometry: {type: 'Point', coordinates: [number, number]}, properties: {name?: string, address: string, url: string, closed: boolean}}>}} GeoJSON FeatureCollection.
 */
export function libraryMapFeatures(libraries, resolvePath = (path) => path) {
  return {
    type: 'FeatureCollection',
    features: libraries
      .filter(
        ({ latitude, longitude }) =>
          Number.isFinite(latitude) &&
          Number.isFinite(longitude) &&
          Math.abs(latitude) <= 90 &&
          Math.abs(longitude) <= 180
      )
      .map((library) => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [library.longitude, library.latitude]
        },
        properties: {
          name: library.name,
          address: library.address || library.postcode || '',
          url:
            typeof library.url === 'string' &&
            library.url.startsWith('/') &&
            !library.url.startsWith('//')
              ? resolvePath(library.url)
              : '',
          closed: Boolean(
            library.closed ||
            library.permanentlyClosed ||
            library.facilityOperated === 'Closed' ||
            library.facilityOperated === 'Facility Not Open'
          )
        }
      }))
  }
}
