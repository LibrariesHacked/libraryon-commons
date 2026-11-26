/**
 * @fileoverview Value conversion and validation shared by directory CMS controls.
 */

import { openingHours } from '../../directory/openingHoursHelpers.mjs'
import { validateSpecialHours } from '../../directory/specialHoursHelpers.mjs'

/**
 * Convert saved daily-hour strings into editable opening and closing rows.
 * @param {string|null|undefined} value - Canonical comma-separated hours.
 * @returns {{open: string, close: string}[]} Session rows.
 */
export function hourSessionRows(value) {
  if (value == null || value === '' || /^(closed|close|n\/a|none)$/i.test(String(value).trim())) {
    return []
  }
  let text = String(value).trim()
  try {
    text = openingHours(text) || ''
  } catch {
    // Keep malformed legacy text visible so editors can correct it instead of losing it.
  }
  return text
    .split(',')
    .filter(Boolean)
    .map((session) => {
      const separator = session.indexOf('-')
      return separator < 0
        ? { open: session.trim(), close: '' }
        : { open: session.slice(0, separator).trim(), close: session.slice(separator + 1).trim() }
    })
}

/**
 * Serialize editable daily-hour rows to the existing comma-separated schema value.
 * @param {{open?: string, close?: string}[]} rows - Sessions in their displayed order.
 * @returns {string|null} Canonical-compatible session text, or null when cleared.
 */
export function serializeHourSessions(rows) {
  const sessions = (Array.isArray(rows) ? rows : [])
    .map(({ open, close }) => `${String(open || '').trim()}-${String(close || '').trim()}`)
    .filter((session) => session !== '-')
  return sessions.length ? sessions.join(',') : null
}

/**
 * Read existing semicolon-separated facilities without changing the stored value.
 * @param {string|null|undefined} value - Canonical stored facilities.
 * @returns {string[]} Display selections, in their original order.
 * @throws {Error} When the stored field is not a string.
 */
export function facilitySelections(value) {
  if (value == null || value === '') return []
  if (typeof value !== 'string') throw new Error('Facilities must be a semicolon-separated string.')
  return value
    .split(';')
    .map((item) => item.trim())
    .filter(Boolean)
}

/**
 * Serialize a native select result back into the existing directory string format.
 * @param {string[]|object|null} value - Array or Decap immutable list; null means cleared.
 * @returns {string|null} Semicolon-separated selections, or null when none are selected.
 * @throws {Error} When a selection cannot be represented safely.
 */
export function serializeFacilities(value) {
  const items = value == null ? [] : Array.isArray(value) ? value : value.toArray?.()
  if (
    !Array.isArray(items) ||
    items.some((item) => typeof item !== 'string' || !item.trim() || item.includes(';'))
  ) {
    throw new Error('Invalid facility selection.')
  }
  return items.length ? items.join('; ') : null
}

/**
 * Validate native opening-hours text without normalizing it or changing closed/unknown data.
 * @param {string|null|undefined} value - Existing daily sessions.
 * @returns {{error: false|{message: string}}} Decap validation result.
 */
export function validateHoursControl(value) {
  try {
    if (openingHours(value) === (value || null)) return { error: false }
  } catch {
    // The native form displays a specific validation message; no save fallback is used.
  }
  return {
    error: {
      message:
        'Use 09:00-17:00 or comma-separated sessions. Times must be in order, not overlap, and end after they start. Midnight closing is 24:00.'
    }
  }
}

/**
 * Allow an optional year to remain blank while validating any supplied value.
 * @param {number|string|null|undefined} value - Year input.
 * @returns {{error: false|{message: string}}} Decap validation result.
 */
export function validateOptionalYear(value) {
  if (value == null || value === '' || (typeof value === 'number' && Number.isNaN(value))) {
    return { error: false }
  }
  const year = Number(value)
  return Number.isInteger(year) && year >= 1000 && year <= 9999
    ? { error: false }
    : { error: { message: 'Enter a four-digit year, or leave this optional field blank.' } }
}

/**
 * Validate the special-hours field, retaining free-text notes and checking dated periods.
 * @param {string|null|undefined} value - Special-hours editor value.
 * @returns {{error: false|{message: string}}} Decap validation result.
 */
export function validateSpecialHoursControl(value) {
  return validateSpecialHours(value)
}
