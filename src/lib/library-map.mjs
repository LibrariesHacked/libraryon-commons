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
