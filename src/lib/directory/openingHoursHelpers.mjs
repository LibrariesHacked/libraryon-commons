/**
 * @fileoverview Opening hours normalization, 24-hour session parsing, and live UK opening status evaluation (Europe/London timezone).
 */

/**
 * Standard ordered day names for public timetable display.
 * @type {readonly ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']}
 */
export const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

/**
 * Standard lowercase day names matching JavaScript `Date.getDay()` indexing (0 = Sunday).
 * @type {readonly ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']}
 */
export const weekDays = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday'
]

/**
 * Convert a 24-hour time string in "HH:MM" format to minutes since midnight.
 * Returns null if the string is invalid or cannot be parsed.
 *
 * @param {string} time - Time string in 24-hour HH:MM format.
 * @returns {number|null} Minutes since midnight, or null if invalid.
 */
export function timeStringToMinutes(time) {
  if (typeof time !== 'string' || !time.includes(':')) return null
  const [hours, minutes] = time.split(':').map(Number)
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null
  return hours * 60 + minutes
}

/**
 * Get the current day of the week and minutes from midnight evaluated in UK time (Europe/London).
 * Correctly accounts for GMT and British Summer Time (BST).
 *
 * @param {Date} [now=new Date()] - Reference date object.
 * @returns {{ day: string, minutes: number }} Lowercase day name and minute offset.
 */
export function getUkDayAndTime(now = new Date()) {
  const dayFormatter = new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    timeZone: 'Europe/London'
  })
  const day = dayFormatter.format(now).toLowerCase()

  const timeFormatter = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Europe/London'
  })
  const timeParts = timeFormatter.format(now).split(':').map(Number)
  const minutes = timeParts[0] * 60 + timeParts[1]

  return { day, minutes }
}

/**
 * Determine live opening status, active session, and user-facing message for a library in UK time.
 *
 * @param {object} openingTimes - Opening hours object keyed by day name.
 * @param {Date} [now=new Date()] - Reference date object.
 * @returns {{
 *   isOpen: boolean,
 *   currentDay: string,
 *   currentFrame: object|null,
 *   nextTodayFrame: object|null,
 *   statusText: string,
 *   hasAnyHours: boolean
 * }} Live evaluation outcome.
 */
export function getLiveOpeningStatus(openingTimes = {}, now = new Date()) {
  const { day: currentDay, minutes: currentMinutes } = getUkDayAndTime(now)
  const todayEntry = openingTimes[currentDay]
  const todayFrames = Array.isArray(todayEntry?.timeFrames) ? todayEntry.timeFrames : []

  let currentFrame = null
  let nextTodayFrame = null

  for (const frame of todayFrames) {
    if (!frame.startTime || !frame.endTime) continue
    const startMin = timeStringToMinutes(frame.startTime)
    const endMin = timeStringToMinutes(frame.endTime)
    if (startMin === null || endMin === null) continue

    if (currentMinutes >= startMin && currentMinutes < endMin) {
      currentFrame = frame
      break
    } else if (
      currentMinutes < startMin &&
      (!nextTodayFrame || startMin < nextTodayFrame.startMin)
    ) {
      nextTodayFrame = { frame, startMin }
    }
  }

  const hasAnyHours = Object.values(openingTimes).some((val) =>
    Array.isArray(val?.timeFrames) ? val.timeFrames.length > 0 : false
  )

  let statusText = 'Closed now'
  if (currentFrame) {
    statusText = `Open now · Closes at ${currentFrame.endTime}`
  } else if (nextTodayFrame) {
    statusText = `Closed now · Opens at ${nextTodayFrame.frame.startTime}`
  }

  return {
    isOpen: Boolean(currentFrame),
    currentDay,
    currentFrame,
    nextTodayFrame: nextTodayFrame?.frame || null,
    statusText,
    hasAnyHours
  }
}

/**
 * Check if a library record or compact hours object is open right now in UK local time.
 * Supports both rich openingTimes objects and compact search-index arrays.
 *
 * @param {object} hours - Opening hours dictionary.
 * @param {Date} [now=new Date()] - Reference date object.
 * @returns {boolean} True if currently open.
 */
export function isHoursOpenNow(hours = {}, now = new Date()) {
  if (!hours || typeof hours !== 'object') return false
  const { day, minutes } = getUkDayAndTime(now)

  // 1. Compact search index format: { monday: [['09:00', '17:00']] }
  const compactSlots = hours[day]
  if (Array.isArray(compactSlots)) {
    return compactSlots.some(([start, end]) => {
      const startMin = timeStringToMinutes(start)
      const endMin = timeStringToMinutes(end)
      return startMin !== null && endMin !== null && minutes >= startMin && minutes < endMin
    })
  }

  // 2. Full directory model format: { monday: { timeFrames: [...] } }
  const frames = hours[day]?.timeFrames
  if (Array.isArray(frames)) {
    return frames.some((frame) => {
      const startMin = timeStringToMinutes(frame?.startTime)
      const endMin = timeStringToMinutes(frame?.endTime)
      return startMin !== null && endMin !== null && minutes >= startMin && minutes < endMin
    })
  }

  return false
}

/**
 * Check if any hours are recorded in an hours dictionary.
 *
 * @param {object} hours - Hours dictionary.
 * @returns {boolean} True if at least one day has time slots.
 */
export function hasRecordedHours(hours = {}) {
  if (!hours || typeof hours !== 'object') return false
  return Object.values(hours).some((val) =>
    Array.isArray(val)
      ? val.length > 0
      : Array.isArray(val?.timeFrames) && val.timeFrames.length > 0
  )
}

/**
 * Client-side helper: Update all library listing items on the page with their live open/closed status.
 * Searches for list items inside containers with [data-library-list].
 */
export function updateLibraryListStatus() {
  if (typeof document === 'undefined') return
  const now = new Date()

  for (const item of document.querySelectorAll('[data-library-list] > li')) {
    const hoursData = item.dataset.hours
    const statusEl = item.querySelector('[data-open-status]')
    if (!hoursData || !statusEl) continue

    try {
      const hours = JSON.parse(hoursData)
      if (!hours || typeof hours !== 'object') continue

      const open = isHoursOpenNow(hours, now)
      const hasHours = hasRecordedHours(hours)

      if (open) {
        statusEl.classList.remove('is-closed')
        statusEl.classList.add('is-open')
        statusEl.innerHTML =
          '<span class="live-status-dot" aria-hidden="true"></span><span>Open now</span>'
      } else if (hasHours) {
        statusEl.classList.remove('is-open')
        statusEl.classList.add('is-closed')
        statusEl.innerHTML =
          '<span class="live-status-dot" aria-hidden="true"></span><span>Closed</span>'
      }
    } catch {
      // Ignore JSON parse errors silently
    }
  }
}

/**
 * Client-side helper: Update opening hours cards on the page.
 * Highlights today's table row, marks the specific active session, and updates the live status pill.
 */
export function updateOpeningHoursCards() {
  if (typeof document === 'undefined') return
  const now = new Date()

  for (const card of document.querySelectorAll('.opening-hours-card')) {
    const timesData = card.dataset.openingTimes
    if (!timesData) continue

    try {
      const openingTimes = JSON.parse(timesData)
      const { isOpen, currentDay, currentFrame, statusText } = getLiveOpeningStatus(
        openingTimes,
        now
      )

      // Highlight today's row in the table
      for (const row of card.querySelectorAll('tbody tr')) {
        if (row.dataset.day === currentDay) {
          row.classList.add('is-today')
        } else {
          row.classList.remove('is-today')
        }
      }

      // Reset any previously highlighted sessions
      for (const frameEl of card.querySelectorAll('.hours-frame')) {
        frameEl.classList.remove('is-current-session')
      }

      // Highlight the active session within today's row
      const todayRow = card.querySelector(`tbody tr[data-day="${currentDay}"]`)
      if (todayRow && currentFrame) {
        for (const frameEl of todayRow.querySelectorAll('.hours-frame')) {
          if (
            frameEl.dataset.start === currentFrame.startTime &&
            frameEl.dataset.end === currentFrame.endTime
          ) {
            frameEl.classList.add('is-current-session')
            break
          }
        }
      }

      // Update the live status pill badge
      const pill = card.querySelector('[data-live-status-pill]')
      const label = card.querySelector('[data-live-status-text]')
      if (pill && label) {
        if (isOpen) {
          pill.classList.remove('is-closed')
          pill.classList.add('is-open')
        } else {
          pill.classList.remove('is-open')
          pill.classList.add('is-closed')
        }
        label.textContent = statusText
      }
    } catch {
      // Ignore JSON parse errors silently
    }
  }
}

/**
 * Normalize and validate explicit 24-hour sessions into canonical comma-separated ranges.
 * For example: '9am - 5pm' or '09:00 - 12:00, 13:00 - 17:00' -> '09:00-12:00,13:00-17:00'.
 * Returns null if the value is empty or represents a closed day.
 *
 * @param {unknown} value - Raw opening hours text.
 * @returns {string|null} Canonical session string or null if closed.
 * @throws {Error} If sessions are ambiguous, invalid, reversed, or overlapping.
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
    ) {
      throw new Error(`Invalid opening hours: ${value}`)
    }
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
 * Convert legacy structured timetable frames into canonical session strings.
 *
 * @param {{timeFrames?: {startTime: string, endTime: string}[]}|null} value - Legacy frame object.
 * @returns {string|null} Normalized session string or null.
 */
export function legacyHours(value) {
  if (!value) return null
  const frames = value.timeFrames || []
  if (!frames.length) return null
  return openingHours(frames.map((frame) => `${frame.startTime}-${frame.endTime}`).join(','))
}

/**
 * Extract compact weekly [startTime, endTime] pairs optimized for lightweight client-side search.
 *
 * @param {object} openingTimes - Structured weekly opening times object.
 * @returns {Record<string, Array<[string, string]>>|null} Compact hours mapping or null.
 */
export function compactOpeningHours(openingTimes) {
  if (!openingTimes || typeof openingTimes !== 'object') return null
  const hours = {}
  for (const day of weekDays) {
    const slots = (openingTimes[day]?.timeFrames || [])
      .filter((frame) => frame?.startTime && frame?.endTime)
      .map((frame) => [frame.startTime, frame.endTime])
    if (slots.length) hours[day] = slots
  }
  return Object.keys(hours).length ? hours : null
}

/**
 * Parse a session range string (e.g. '09:00-17:00') into numeric minute bounds from midnight.
 *
 * @param {string} session - A single session string like '09:30-17:00'.
 * @returns {{startMinutes: number, endMinutes: number}|null} Minute bounds, or null if invalid.
 */
export function parseSessionTimes(session) {
  if (!session || typeof session !== 'string') return null
  const parts = session.trim().split('-')
  if (parts.length !== 2) return null
  const [startH, startM] = parts[0].split(':').map(Number)
  const [endH, endM] = parts[1].split(':').map(Number)
  if (isNaN(startH) || isNaN(startM) || isNaN(endH) || isNaN(endM)) return null
  return {
    startMinutes: startH * 60 + startM,
    endMinutes: endH * 60 + endM
  }
}

/**
 * Get the current time breakdown evaluated in UK local time (Europe/London).
 *
 * @param {Date} [referenceDate=new Date()] - Reference date object.
 * @returns {{dayOfWeek: number, currentMinutes: number, dateString: string, timeString: string}} Breakdown.
 */
export function getUkNow(referenceDate = new Date()) {
  const { day, minutes } = getUkDayAndTime(referenceDate)
  const dayOfWeek = weekDays.indexOf(day)
  return {
    dayOfWeek,
    currentMinutes: minutes,
    dateString: referenceDate.toISOString().slice(0, 10),
    timeString: `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
  }
}

/**
 * Parse a comma-separated day string from URL parameters into normalized day names.
 *
 * @param {string|null} daysParam - Comma-separated query string (e.g. 'monday,wednesday').
 * @returns {string[]} Valid lowercase day names.
 */
export function parseDaysParam(daysParam) {
  if (!daysParam) return []
  return daysParam
    .toLowerCase()
    .split(',')
    .map((day) => day.trim())
    .filter((day) => weekDays.includes(day))
}

/**
 * Get today's lowercase day name in UK local time (e.g. 'monday').
 *
 * @param {Date} [referenceDate=new Date()] - Reference date object.
 * @returns {string} Lowercase day name.
 */
export function getTodayDayName(referenceDate = new Date()) {
  const { day } = getUkDayAndTime(referenceDate)
  return day
}
