/**
 * @fileoverview GeoJSON FeatureCollection generation for library map rendering.
 */

/**
 * Convert library records into a GeoJSON FeatureCollection for interactive maps.
 * @param {Array<{latitude?: number|null, longitude?: number|null, name?: string, address?: string, postcode?: string, url?: string, closed?: boolean, permanentlyClosed?: boolean, facilityOperated?: string}>} libraries - Library records.
 * @param {(path: string) => string} [resolvePath=(path) => path] - URL resolver function for link paths.
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
