/**
 * @fileoverview UK postcode and UPRN normalization, address formatting, and plain-English translations for facilities and operating models.
 */

/**
 * Standard UK facility label overrides for machine-readable codes.
 */
const facilityLabels = {
  'step-free-access': 'Step-free access',
  'sensory-friendly-environment': 'Sensory-friendly environment',
  'dda-compliant': 'DDA-compliant',
  school_college: 'School or college',
  uni_he: 'University or higher education'
}

/**
 * Standard UK operating model labels mapping schema codes to user-friendly titles.
 */
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
 * Normalize UK postcode casing and spacing into standard 'OUTWARD INWARD' format.
 * Returns null if the input string is not a syntactically valid UK postcode structure.
 * Note: Syntactic validity does not guarantee the building exists; ONS verification is required.
 *
 * @param {unknown} value - Raw postcode string or empty value.
 * @returns {string|null} Standardized postcode (e.g. 'SW1A 1AA') or null.
 */
export function normalizePostcode(value) {
  const compact = String(value ?? '')
    .toUpperCase()
    .replace(/\s/g, '')
  return /^[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2}$/.test(compact) || compact === 'GIR0AA'
    ? `${compact.slice(0, -3)} ${compact.slice(-3)}`
    : null
}

/**
 * Parse and validate a UK Unique Property Reference Number (UPRN).
 * Rejects non-numeric text, exponents, negative values, and unsafe integers.
 *
 * @param {unknown} value - Candidate UPRN value.
 * @returns {number|null} Safe integer identifier or null if invalid.
 */
export function normalizeUprn(value) {
  const text = String(value ?? '').trim()
  if (!/^\d{1,12}$/.test(text)) return null
  const number = Number(text)
  return Number.isSafeInteger(number) && number > 0 ? number : null
}

/**
 * Extract a single formatted address string from a library record.
 * Combines address lines, town, and postcode while omitting empty values.
 *
 * @param {object} library - Library model or record.
 * @returns {string} Formatted address string.
 */
export function libraryAddress(library) {
  return library?.address || ''
}

/**
 * Translate machine-readable facility identifiers into plain English descriptions.
 *
 * @param {string} value - Schema identifier or tag name.
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

/**
 * Translate library operating model codes into plain-English wording.
 *
 * @param {string} value - Operating model code or label.
 * @returns {string} Human-readable operating model description.
 */
export function operatingModelLabel(value) {
  return operatingLabels[value] || value || ''
}

/**
 * Collect unique values from an array of records using an extractor function, preserving first-seen order.
 *
 * @template T
 * @param {T[]} records - Array of records.
 * @param {(record: T) => unknown[]} read - Value extractor function returning an array of items.
 * @returns {unknown[]} Deduplicated values in order of appearance.
 */
export function collectValues(records, read) {
  const seen = new Set()
  for (const record of records) {
    for (const value of read(record) || []) {
      seen.add(value)
    }
  }
  return [...seen]
}
