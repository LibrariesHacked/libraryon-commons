/** Return the editable address, with compatibility for original source records. */
export function libraryAddress(library) {
  return library.address || library.streetAddress || library.location?.place_name || '';
}

const facilityLabels = {
  'step-free-access': 'Step-free access',
  'sensory-friendly-environment': 'Sensory-friendly environment',
  'dda-compliant': 'DDA-compliant',
  school_college: 'School or college',
  uni_he: 'University or higher education'
};

/** Format data identifiers without inventing facilities or accessibility claims. */
export function facilityLabel(value) {
  return (
    facilityLabels[value] ||
    String(value)
      .replace(/[-_]/g, ' ')
      .replace(/^./, (initial) => initial.toUpperCase())
  );
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
};

/** Describe who runs a library using the original site's wording. */
export function operatingModelLabel(value) {
  return operatingLabels[value] || value || '';
}

/** Build map links from the address, falling back to coordinates only where needed. */
export function mapLinks(library) {
  const address = libraryAddress(library);
  const hasPoint = Number.isFinite(library.latitude) && Number.isFinite(library.longitude);
  if (!address && !hasPoint) return null;
  const point = `${library.latitude},${library.longitude}`;
  return {
    google: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
      hasPoint && !address ? point : `library ${address}`
    )}`,
    apple: hasPoint
      ? `https://maps.apple.com/?ll=${point}`
      : `https://maps.apple.com/?q=${encodeURIComponent(address)}`
  };
}

/** Return the unique values of a field across records, in first-seen order. */
export function collectValues(records, read) {
  const seen = new Set();
  for (const record of records) for (const value of read(record) || []) seen.add(value);
  return [...seen];
}

const toRadians = (degrees) => (degrees * Math.PI) / 180;
const earthMiles = 3958.8;
const weekDays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/**
 * Calculate straight-line distance in miles between two coordinate records.
 * @param {{latitude?: number, longitude?: number}} first - Origin coordinates.
 * @param {{latitude?: number, longitude?: number}} second - Target coordinates.
 * @returns {number|null} Distance in miles, or null when either coordinate is missing.
 */
export function distanceMiles(first, second) {
  if (
    !Number.isFinite(first?.latitude) ||
    !Number.isFinite(first?.longitude) ||
    !Number.isFinite(second?.latitude) ||
    !Number.isFinite(second?.longitude)
  )
    return null;
  const lat = toRadians(first.latitude);
  const otherLat = toRadians(second.latitude);
  const haversine =
    Math.sin((otherLat - lat) / 2) ** 2 +
    Math.cos(lat) *
      Math.cos(otherLat) *
      Math.sin(toRadians(second.longitude - first.longitude) / 2) ** 2;
  return 2 * earthMiles * Math.asin(Math.sqrt(haversine));
}

/** Extract compact weekly [startTime, endTime] pairs for client-side "Open now" filtering. */
export function compactOpeningHours(openingTimes) {
  if (!openingTimes || typeof openingTimes !== 'object') return null;
  const hours = {};
  for (const day of weekDays) {
    const slots = (openingTimes[day]?.timeFrames || [])
      .filter((frame) => frame?.startTime && frame?.endTime)
      .map((frame) => [frame.startTime, frame.endTime]);
    if (slots.length) hours[day] = slots;
  }
  return Object.keys(hours).length ? hours : null;
}

/**
 * Find the closest open libraries to one library, by straight-line distance.
 * @param {object} library - Library with latitude and longitude.
 * @param {object[]} candidates - All directory libraries.
 * @param {number} [count=5] - Number of neighbours to return.
 * @returns {Array<{library: object, miles: number}>} Nearest first.
 */
export function nearbyLibraries(library, candidates, count = 5) {
  if (!Number.isFinite(library.latitude) || !Number.isFinite(library.longitude)) return [];
  const nearest = [];
  for (const other of candidates) {
    if (other.id === library.id || other.permanentlyClosed) continue;
    const miles = distanceMiles(library, other);
    if (miles === null) continue;
    if (nearest.length === count && miles >= nearest[count - 1].miles) continue;
    nearest.push({ library: other, miles });
    nearest.sort((first, second) => first.miles - second.miles);
    if (nearest.length > count) nearest.pop();
  }
  return nearest;
}

/**
 * Assemble a validated directory from individual library and authority records.
 * Relationships come from the editable authority field, never stale source ID lists.
 * @param {object[]} authorityRecords - Editable authorities.
 * @param {object[]} libraryRecords - Individually editable libraries.
 * @returns {object} Directory records, stable paths and a minimal browser search index.
 */
export function createDirectory(authorityRecords, libraryRecords) {
  const authorities = [...authorityRecords].sort((first, second) =>
    first.name.localeCompare(second.name, 'en')
  );
  const bySlug = new Map();
  for (const authority of authorities) {
    if (!/^[A-Za-z0-9][A-Za-z0-9-]*$/.test(authority.slug || '') || bySlug.has(authority.slug))
      throw new Error(`Missing or duplicate authority slug: ${authority.slug}`);
    bySlug.set(authority.slug, { ...authority, library_ids: [] });
  }
  const authorityByLibrary = new Map();
  const paths = new Set();
  const ids = new Set();
  const libraries = [];
  const add = (record) => {
    const slug = record.authority || '';
    if (!record.name || !/^[A-Za-z0-9][A-Za-z0-9-]*$/.test(record.slug || ''))
      throw new Error(`Invalid library name or slug: ${record.name || '(unnamed)'}`);
    const authority = slug ? bySlug.get(slug) : null;
    if (slug && !authority) throw new Error(`Unknown authority ${slug} for ${record.name}`);
    const id = record.id || `${slug || 'unassigned'}/${record.slug}`;
    const url = `/libraries/${slug || 'unassigned'}/${record.slug}/`;
    if (ids.has(id) || paths.has(url))
      throw new Error(`Duplicate library ID or route: ${record.name}`);
    ids.add(id);
    paths.add(url);
    const library = { ...record, id, authority: slug, url };
    libraries.push(library);
    if (authority) {
      authorityByLibrary.set(id, authority);
      authority.library_ids.push(id);
    }
  };
  for (const library of libraryRecords) add(library);
  const libraryPath = (library) => library.url;
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
    .sort((first, second) => first.name.localeCompare(second.name, 'en'));
  return {
    libraries,
    authorities: [...bySlug.values()],
    authorityByLibrary,
    libraryPath,
    searchRecords
  };
}
