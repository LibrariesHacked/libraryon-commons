/** @type {readonly ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']} */
export const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

/**
 * Normalize postcode case and spacing without claiming that the postcode exists.
 * @param {unknown} value - Source identifier or missing-value marker.
 * @returns {string|null} Syntactically usable postcode; ONS lookup remains required.
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
 * Parse a positive, exact identifier without accepting exponents or unsafe integers.
 * @param {unknown} value - Source UPRN, optionally with leading zeros.
 * @returns {number|null} Identifier for matching; not independent existence evidence.
 */
export function normalizeUprn(value) {
  const text = String(value ?? '').trim()
  if (!/^\d{1,12}$/.test(text)) return null
  const number = Number(text)
  return Number.isSafeInteger(number) && number > 0 ? number : null
}

/**
 * Normalize explicit 24-hour sessions and legacy no-hours labels without guessing.
 * @param {unknown} value - Split-session text, blank or legacy closed marker.
 * @returns {string|null} Canonical ordered sessions, or null when no hours are given.
 * @throws {Error} For ambiguous, invalid, reversed or overlapping sessions.
 */
export function openingHours(value) {
  if (value === null || value === undefined || value === '') return null
  if (!String(value).trim() || /^(closed|close|n\/a|none)$/i.test(String(value).trim())) return null
  const text = String(value)
    .trim()
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\s+/g, '')
  const slots = text.split(',').map((slot) => {
    const match = slot.match(/^(\d{1,2})[:.](\d{2})-(\d{1,2})[:.](\d{2})$/)
    if (!match) throw new Error(`Ambiguous opening hours: ${value}`)
    const [, startHour, startMinute, endHour, endMinute] = match.map(Number)
    if (
      startHour > 23 ||
      endHour > 24 ||
      startMinute > 59 ||
      endMinute > 59 ||
      (endHour === 24 && endMinute !== 0) ||
      startHour * 60 + startMinute >= endHour * 60 + endMinute
    )
      throw new Error(`Invalid opening hours: ${value}`)
    return `${String(startHour).padStart(2, '0')}:${String(startMinute).padStart(2, '0')}-${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}`
  })
  for (let index = 1; index < slots.length; index++) {
    if (slots[index].slice(0, 5) < slots[index - 1].slice(6)) {
      throw new Error(`Overlapping opening hours: ${value}`)
    }
  }
  return slots.join(',')
}

/**
 * Convert explicit legacy time frames through the same strict session parser.
 * @param {{timeFrames?: {startTime: string, endTime: string}[]}|null} value - Day frames.
 * @returns {string|null} Normalized sessions; no invented times for an empty day.
 */
export function legacyHours(value) {
  if (!value) return null
  const frames = value.timeFrames || []
  if (!frames.length) return null
  return openingHours(frames.map((frame) => `${frame.startTime}-${frame.endTime}`).join(','))
}
