/** @fileoverview Google Business Profile-compatible special-hours periods and legacy notes. */

const draftKey = '__librarycommonsSpecialHoursDraft'
const timePattern = /^(?:[01]\d|2[0-4]):[0-5]\d$/

/**
 * Read a date as a Google Business Profile date object.
 * @param {string} value - ISO calendar date.
 * @returns {{year: number, month: number, day: number}|null} Date parts or null when invalid.
 */
function dateParts(value) {
  const match = typeof value === 'string' && value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null
  const [, year, month, day] = match.map(Number)
  const date = new Date(0)
  date.setUTCHours(0, 0, 0, 0)
  date.setUTCFullYear(year, month - 1, day)
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null
  }
  return { year, month, day }
}

/**
 * Read a Google Business Profile date object as an ISO date string.
 * @param {object} value - Google API date fields.
 * @returns {string} ISO date or an empty string when invalid.
 */
function isoDate(value) {
  if (!value || typeof value !== 'object') return ''
  const year = String(value.year || '').padStart(4, '0')
  const month = String(value.month || '').padStart(2, '0')
  const day = String(value.day || '').padStart(2, '0')
  const result = `${year}-${month}-${day}`
  return dateParts(result) ? result : ''
}

/**
 * Convert stored special-hours text into editor rows, preserving older free-text notes.
 * @param {string|null|undefined} value - Existing schema-compatible field value.
 * @returns {{periods: object[], notes: string, invalid: boolean}} Editable periods and notes.
 */
export function parseSpecialHours(value) {
  if (value == null || value === '') return { periods: [], notes: '', invalid: false }
  const text = String(value)
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    return { periods: [], notes: text, invalid: false }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { periods: [], notes: text, invalid: false }
  }
  if (parsed[draftKey] === 1) {
    return {
      periods: Array.isArray(parsed.periods) ? parsed.periods : [],
      notes: typeof parsed.notes === 'string' ? parsed.notes : '',
      invalid: !Array.isArray(parsed.periods)
    }
  }
  if (!Object.hasOwn(parsed, 'specialHourPeriods')) {
    return { periods: [], notes: text, invalid: false }
  }
  if (!Array.isArray(parsed.specialHourPeriods)) {
    return {
      periods: [],
      notes: typeof parsed.notes === 'string' ? parsed.notes : '',
      invalid: true
    }
  }
  return {
    periods: parsed.specialHourPeriods.map((period) => ({
      date: isoDate(period?.startDate),
      endDate: period?.endDate ? isoDate(period.endDate) : '',
      invalidEndDate: Boolean(period?.endDate && !isoDate(period.endDate)),
      isClosed: period?.isClosed === true,
      openTime: typeof period?.openTime === 'string' ? period.openTime : '',
      closeTime: typeof period?.closeTime === 'string' ? period.closeTime : ''
    })),
    notes: typeof parsed.notes === 'string' ? parsed.notes : '',
    invalid: parsed.specialHourPeriods.some((period) => period?.endDate && !isoDate(period.endDate))
  }
}

/**
 * Keep incomplete editor values as a temporary string until pre-save normalization.
 * @param {object[]} periods - Date and time rows from the editor.
 * @param {string} notes - Optional legacy or contextual note.
 * @returns {string|null} Draft value or null when entirely blank.
 */
export function serializeSpecialHoursDraft(periods, notes) {
  const safePeriods = Array.isArray(periods) ? periods : []
  const safeNotes = typeof notes === 'string' ? notes : ''
  if (!safePeriods.length && !safeNotes.trim()) return null
  return JSON.stringify({ [draftKey]: 1, periods: safePeriods, notes: safeNotes })
}

/**
 * Validate dated special-hour periods, including same-day overlaps and Google-compatible times.
 * @param {string|null|undefined} value - Draft, Google-compatible JSON, or legacy note.
 * @returns {{error: false|{message: string}}} Decap control validation result.
 */
export function validateSpecialHours(value) {
  const { periods, invalid } = parseSpecialHours(value)
  if (invalid) {
    return { error: { message: 'Special hours could not be read. Remove and re-enter the dates.' } }
  }
  const intervals = []
  for (const period of periods) {
    if (!dateParts(period.date)) {
      return { error: { message: 'Choose a valid date for each special-hours period.' } }
    }
    if (period.invalidEndDate) {
      return { error: { message: 'Choose a valid end date for each special-hours period.' } }
    }
    const startDate = dateParts(period.date)
    const endDate = period.endDate ? dateParts(period.endDate) : startDate
    if (!endDate) {
      return { error: { message: 'Choose a valid end date for each special-hours period.' } }
    }
    const dateOrdinal = ({ year, month, day }) => {
      const date = new Date(0)
      date.setUTCHours(0, 0, 0, 0)
      date.setUTCFullYear(year, month - 1, day)
      return date.getTime() / (24 * 60 * 60 * 1000)
    }
    const startDay = dateOrdinal(startDate)
    const endDay = dateOrdinal(endDate)
    if (endDay < startDay || endDay - startDay > 1) {
      return {
        error: { message: 'A special period can end on its start date or the following date.' }
      }
    }
    if (period.isClosed) {
      intervals.push({ start: startDay * 1440, end: (startDay + 1) * 1440, closed: true })
      continue
    }
    const validTime = (time, closing = false) =>
      typeof time === 'string' &&
      timePattern.test(time) &&
      (!time.startsWith('24:') || time === '24:00') &&
      (closing || time !== '24:00')
    if (!validTime(period.openTime) || !validTime(period.closeTime, true)) {
      return { error: { message: 'Enter opening and closing times in 24-hour HH:MM format.' } }
    }
    const minutes = (time) => {
      const [hour, minute] = time.split(':').map(Number)
      return hour * 60 + minute
    }
    const start = startDay * 1440 + minutes(period.openTime)
    const end = endDay * 1440 + minutes(period.closeTime)
    if (end <= start || end - start >= 1440) {
      return { error: { message: 'Each special-hours period must last less than 24 hours.' } }
    }
    intervals.push({ start, end, closed: false })
  }
  intervals.sort((first, second) => first.start - second.start)
  for (let index = 1; index < intervals.length; index++) {
    if (intervals[index].start < intervals[index - 1].end) {
      if (intervals[index].closed || intervals[index - 1].closed) {
        return { error: { message: 'A closed date cannot also have opening periods.' } }
      }
      return { error: { message: 'Special-hours periods must not overlap.' } }
    }
  }
  return { error: false }
}

/**
 * Convert editor rows to a Google Business Profile SpecialHours JSON value before saving.
 * @param {string|null|undefined} value - Editor value or an existing plain-text note.
 * @returns {string|null} Google-compatible period JSON, preserved note, or null.
 * @throws {Error} When a dated period is incomplete or invalid.
 */
export function serializeSpecialHoursForSave(value) {
  const { periods, notes, invalid } = parseSpecialHours(value)
  if (invalid) throw new Error('Special hours could not be read. Remove and re-enter the dates.')
  if (!periods.length) return notes || null
  const validation = validateSpecialHours(value)
  if (validation.error) throw new Error(validation.error.message)
  const specialHourPeriods = periods.map(({ date, endDate, isClosed, openTime, closeTime }) => ({
    startDate: dateParts(date),
    ...(isClosed
      ? { isClosed: true }
      : {
          ...(endDate && endDate !== date ? { endDate: dateParts(endDate) } : {}),
          openTime,
          closeTime
        })
  }))
  return JSON.stringify({ specialHourPeriods, ...(notes ? { notes } : {}) })
}

/**
 * Format special dates and legacy notes for the public opening-hours panel.
 * @param {string|null|undefined} value - Stored special-hours value.
 * @returns {string} Human-readable notes and dated exceptions.
 */
export function formatSpecialHours(value) {
  const { periods, notes, invalid } = parseSpecialHours(value)
  if (invalid || periods.some((period) => !dateParts(period.date))) return String(value || '')
  if (!periods.length) return notes
  const byDate = new Map()
  for (const period of periods) {
    const date = period.date
    const sameDate = byDate.get(date) || []
    const end =
      period.endDate && period.endDate !== date
        ? new Intl.DateTimeFormat('en-GB', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
            timeZone: 'UTC'
          }).format(new Date(`${period.endDate}T00:00:00Z`))
        : ''
    sameDate.push(
      period.isClosed
        ? 'Closed'
        : `${period.openTime}–${period.closeTime}${end ? ` (until ${end})` : ''}`
    )
    byDate.set(date, sameDate)
  }
  const exceptions = [...byDate].map(([date, sessions]) => {
    const [year, month, day] = date.split('-').map(Number)
    const label = new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC'
    }).format(new Date(Date.UTC(year, month - 1, day)))
    return `${label}: ${sessions.join(', ')}`
  })
  return [notes, ...exceptions].filter(Boolean).join('\n')
}
