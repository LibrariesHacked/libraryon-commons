export const normalise = (value) => (value || '').toLowerCase().trim();
const compact = (value) => normalise(value).replace(/\s+/g, '');
const toRadians = (degrees) => (degrees * Math.PI) / 180;
const earthMiles = 3958.8;
const weekDays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const toMinutes = (time) => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(time || '').trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
};

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

/**
 * Check whether a library record is open at the supplied date/time.
 * @param {object} record - Library or search index record.
 * @param {Date} [now=new Date()] - Reference date/time.
 * @returns {boolean} True when the library is not closed and has a matching time slot.
 */
export function isLibraryOpenAt(record, now = new Date()) {
  if (
    !record ||
    record.closed ||
    record.permanentlyClosed ||
    record.facilityOperated === 'Closed' ||
    record.facilityOperated === 'Facility Not Open'
  )
    return false;
  const day = weekDays[now.getDay()];
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const compactSlots = record.hours?.[day];
  if (Array.isArray(compactSlots)) {
    return compactSlots.some(([start, end]) => {
      const startMinutes = toMinutes(start);
      const endMinutes = toMinutes(end);
      return (
        startMinutes !== null &&
        endMinutes !== null &&
        currentMinutes >= startMinutes &&
        currentMinutes < endMinutes
      );
    });
  }
  const timeFrames = record.openingTimes?.[day]?.timeFrames;
  if (Array.isArray(timeFrames)) {
    return timeFrames.some((frame) => {
      const startMinutes = toMinutes(frame?.startTime);
      const endMinutes = toMinutes(frame?.endTime);
      return (
        startMinutes !== null &&
        endMinutes !== null &&
        currentMinutes >= startMinutes &&
        currentMinutes < endMinutes
      );
    });
  }
  return false;
}

/**
 * Derive a reference coordinate from directory records matching a postcode or place query.
 * @param {object[]} records - Directory search records.
 * @param {string} query - User search string.
 * @returns {{latitude: number, longitude: number, label: string}|null} Reference coordinates.
 */
export function resolveQueryLocation(records, query) {
  const needle = normalise(query);
  const compactNeedle = compact(query);
  if (!needle) return null;
  const withCoords = (items) =>
    items.filter(
      (record) => Number.isFinite(record.latitude) && Number.isFinite(record.longitude)
    );
  const exactPostcode = withCoords(
    records.filter((record) => compact(record.postcode) === compactNeedle)
  );
  const exactTown = withCoords(records.filter((record) => normalise(record.town) === needle));
  const partialMatches = withCoords(
    records.filter((record) => matchesLibrary(record, { query }))
  );
  const pool = exactPostcode.length
    ? exactPostcode
    : exactTown.length
      ? exactTown
      : partialMatches;
  if (!pool.length) return null;
  const latitude = pool.reduce((sum, item) => sum + item.latitude, 0) / pool.length;
  const longitude = pool.reduce((sum, item) => sum + item.longitude, 0) / pool.length;
  return { latitude, longitude, label: query.trim() };
}

/**
 * Check whether a library record matches the search query and LibraryOn filters.
 * @param {object} record - Search index record.
 * @param {object} [filters={}] - Active query and filter values.
 * @returns {boolean} True when the record satisfies all active filters.
 */
export function matchesLibrary(record, filters = {}) {
  const {
    query = '',
    authority = '',
    country = '',
    services = [],
    accessibility = [],
    openNow = false,
    location = null,
    distance = 5,
    now = new Date()
  } = filters;
  if (authority && record.authority !== authority) return false;
  if (country && record.country !== country) return false;
  if (services.length) {
    const recordServices = new Set(
      (record.services || []).map((item) =>
        normalise(typeof item === 'string' ? item : item?.service)
      )
    );
    if (!services.every((service) => recordServices.has(normalise(service)))) return false;
  }
  if (accessibility.length) {
    const recordAccessibility = new Set((record.accessibility || []).map(normalise));
    if (!accessibility.every((item) => recordAccessibility.has(normalise(item)))) return false;
  }
  if (openNow && !isLibraryOpenAt(record, now)) return false;
  if (
    location &&
    Number.isFinite(location.latitude) &&
    Number.isFinite(location.longitude)
  ) {
    const miles = distanceMiles(location, record);
    if (miles === null || miles > Number(distance || 5)) return false;
  }
  const needle = normalise(query);
  if (!needle) return true;
  const fields = [
    record.name,
    record.address,
    record.town,
    record.postcode,
    record.authorityName
  ]
    .filter(Boolean)
    .join(' ');
  return normalise(fields).includes(needle) || compact(fields).includes(compact(query));
}
