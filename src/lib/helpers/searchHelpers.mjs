/**
 * @fileoverview Client-side directory search algorithms, /directory.json payload compaction, and multi-filter criteria matching.
 */

import { isHoursOpenNow, weekDays } from './openingHoursHelpers.mjs'
import { distanceMiles } from './geoHelpers.mjs'

/**
 * Normalise a string by trimming whitespace and converting to lowercase.
 *
 * @param {string} [value=''] - String to normalise.
 * @returns {string} Normalised lowercase string.
 */
export const normalise = (value) => (value || '').toLowerCase().trim()

/**
 * Remove all whitespace from a normalised string for fuzzy query matching.
 *
 * @param {string} [value=''] - String to compact.
 * @returns {string} Lowercase string with all whitespace removed.
 */
const compact = (value) => normalise(value).replace(/\s+/g, '')

const searchFields = new WeakMap()

/**
 * Convert a time string in "HH:MM" format to minutes from midnight.
 *
 * @param {string|null} time - Time string (e.g. "09:30").
 * @returns {number|null} Minutes from midnight, or null if invalid.
 */
const toMinutes = (time) => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(time || '').trim())
  if (!match) return null
  return Number(match[1]) * 60 + Number(match[2])
}

/**
 * Compact library search records into a bandwidth-efficient JSON payload with shared dictionaries.
 *
 * @param {object[]} records - Unpacked library search records.
 * @returns {{version: number, authorities: Array<[string, string, string]>, services: string[], accessibility: string[], rows: Array}} Compacted directory payload.
 */
export function compactDirectory(records) {
  const authorities = []
  const authorityIndexes = new Map()
  const services = []
  const serviceIndexes = new Map()
  const accessibility = []
  const accessibilityIndexes = new Map()

  for (const record of records) {
    for (const s of record.services || []) {
      const name = typeof s === 'string' ? s : s?.service
      if (name && !serviceIndexes.has(name)) {
        serviceIndexes.set(name, services.length)
        services.push(name)
      }
    }
    for (const a of record.accessibility || []) {
      if (a && !accessibilityIndexes.has(a)) {
        accessibilityIndexes.set(a, accessibility.length)
        accessibility.push(a)
      }
    }
  }

  const rows = records.map((record) => {
    if (!authorityIndexes.has(record.authority)) {
      authorityIndexes.set(record.authority, authorities.length)
      authorities.push([record.authority, record.authorityName, record.country])
    }
    const s = (record.services || [])
      .map((item) => serviceIndexes.get(typeof item === 'string' ? item : item?.service))
      .filter((i) => i !== undefined)
    const a = (record.accessibility || [])
      .map((item) => accessibilityIndexes.get(item))
      .filter((i) => i !== undefined)

    let hours = null
    if (record.hours && typeof record.hours === 'object') {
      const slots = []
      for (const [day, daySlots] of Object.entries(record.hours)) {
        const dayIdx = weekDays.indexOf(day)
        if (dayIdx !== -1 && Array.isArray(daySlots) && daySlots.length > 0) {
          slots.push([dayIdx, daySlots.map(([start, end]) => [toMinutes(start), toMinutes(end)])])
        }
      }
      if (slots.length > 0) hours = slots
    }

    return [
      record.name,
      record.url,
      record.address,
      record.postcode,
      record.town,
      authorityIndexes.get(record.authority),
      s,
      a,
      hours,
      Number(record.closed),
      Number.isFinite(record.latitude) ? Math.round(record.latitude * 1e4) / 1e4 : null,
      Number.isFinite(record.longitude) ? Math.round(record.longitude * 1e4) / 1e4 : null
    ]
  })
  return { version: 1, authorities, services, accessibility, rows }
}

/**
 * Reconstruct rich library search records from a compacted directory payload in the browser.
 *
 * @param {{version: number, authorities: Array<[string, string, string]>, services?: string[], accessibility?: string[], rows: Array}} data - Compacted directory payload.
 * @returns {object[]} Array of unpacked library search records.
 */
export function expandDirectory(data) {
  if (data.version !== 1) throw new Error('Unsupported directory version')
  const toTime = (m) =>
    typeof m === 'number'
      ? `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
      : m

  return data.rows.map((row) => {
    const [authority, authorityName, country] = data.authorities[row[5]]
    const services = Array.isArray(row[6])
      ? data.services
        ? row[6].map((i) => data.services[i] ?? i)
        : row[6]
      : []
    const accessibility = Array.isArray(row[7])
      ? data.accessibility
        ? row[7].map((i) => data.accessibility[i] ?? i)
        : row[7]
      : []

    let hours = null
    if (Array.isArray(row[8])) {
      hours = {}
      for (const [dayIdx, slots] of row[8]) {
        const dayName = typeof dayIdx === 'number' ? weekDays[dayIdx] : dayIdx
        if (dayName) {
          hours[dayName] = slots.map(([start, end]) => [toTime(start), toTime(end)])
        }
      }
    } else if (row[8]) {
      hours = row[8]
    }

    return {
      name: row[0],
      url: row[1],
      address: row[2],
      postcode: row[3],
      town: row[4],
      authority,
      authorityName,
      country,
      services,
      accessibility,
      hours,
      closed: Boolean(row[9]),
      latitude: row[10],
      longitude: row[11]
    }
  })
}

/**
 * Check whether a library record is currently open at a given date/time in UK local time.
 *
 * @param {object} record - Library or search index record.
 * @param {Date} [now=new Date()] - Reference date/time.
 * @returns {boolean} True if the library has an active opening session.
 */
export function isLibraryOpenAt(record, now = new Date()) {
  if (
    !record ||
    record.closed ||
    record.permanentlyClosed ||
    record.facilityOperated === 'Closed' ||
    record.facilityOperated === 'Facility Not Open'
  ) {
    return false
  }
  return isHoursOpenNow(record.hours || record.openingTimes, now)
}

/**
 * Derive a reference coordinate from directory records matching a postcode or place query.
 *
 * @param {object[]} records - Directory search records.
 * @param {string} query - User search query.
 * @returns {{latitude: number, longitude: number, label: string}|null} Reference coordinates or null.
 */
export function resolveQueryLocation(records, query) {
  const needle = normalise(query)
  const compactNeedle = compact(query)
  if (!needle) return null
  const withCoords = (items) =>
    items.filter((record) => Number.isFinite(record.latitude) && Number.isFinite(record.longitude))
  const exactPostcode = withCoords(
    records.filter((record) => compact(record.postcode) === compactNeedle)
  )
  const exactTown = withCoords(records.filter((record) => normalise(record.town) === needle))
  const partialMatches = withCoords(records.filter((record) => matchesLibrary(record, { query })))
  const pool = exactPostcode.length ? exactPostcode : exactTown.length ? exactTown : partialMatches
  if (!pool.length) return null
  const latitude = pool.reduce((sum, item) => sum + item.latitude, 0) / pool.length
  const longitude = pool.reduce((sum, item) => sum + item.longitude, 0) / pool.length
  return { latitude, longitude, label: query.trim() }
}

/**
 * Evaluate whether a library record matches the active search query and filter criteria.
 *
 * @param {object} record - Search index record.
 * @param {object} [filters={}] - Active query and filter values.
 * @returns {boolean} True if the record satisfies all active filters.
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
  } = filters

  if (authority && record.authority !== authority) return false
  if (country && record.country !== country) return false

  if (services.length) {
    const recordServices = new Set(
      (record.services || []).map((item) =>
        normalise(typeof item === 'string' ? item : item?.service)
      )
    )
    if (!services.every((service) => recordServices.has(normalise(service)))) return false
  }

  if (accessibility.length) {
    const recordAccessibility = new Set((record.accessibility || []).map(normalise))
    if (!accessibility.every((item) => recordAccessibility.has(normalise(item)))) return false
  }

  if (openNow && !isLibraryOpenAt(record, now)) return false

  if (location && Number.isFinite(location.latitude) && Number.isFinite(location.longitude)) {
    const miles = distanceMiles(location, record)
    if (miles === null || miles > Number(distance || 5)) return false
  }

  const needle = normalise(query)
  if (!needle) return true

  if (!searchFields.has(record)) {
    const fields = [record.name, record.address, record.town, record.postcode, record.authorityName]
      .filter(Boolean)
      .join(' ')
    searchFields.set(record, [normalise(fields), compact(fields)])
  }
  const [text, compactText] = searchFields.get(record)
  return text.includes(needle) || compactText.includes(compact(query))
}

export { distanceMiles }
