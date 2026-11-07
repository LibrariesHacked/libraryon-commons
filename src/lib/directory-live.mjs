/**
 * @fileoverview Live opening hours helpers and client status updates for directory pages.
 * Evaluates library opening times using UK local time (Europe/London) and updates page controls.
 */

const weekDays = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday'
]

/**
 * Convert a HH:MM time string to minutes from midnight.
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
 * Get the current day of the week and minutes from midnight in UK time.
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
 * Determine live opening status, active session, and user-facing message for a library.
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
  const todayFrames = Array.isArray(todayEntry?.timeFrames)
    ? todayEntry.timeFrames
    : []

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
 * Check if a library record or compact hours object is open right now.
 * Supports both rich openingTimes and compact search-index hours format.
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
      return (
        startMin !== null &&
        endMin !== null &&
        minutes >= startMin &&
        minutes < endMin
      )
    })
  }

  // 2. Full directory model format: { monday: { timeFrames: [...] } }
  const frames = hours[day]?.timeFrames
  if (Array.isArray(frames)) {
    return frames.some((frame) => {
      const startMin = timeStringToMinutes(frame?.startTime)
      const endMin = timeStringToMinutes(frame?.endTime)
      return (
        startMin !== null &&
        endMin !== null &&
        minutes >= startMin &&
        minutes < endMin
      )
    })
  }

  return false
}

/**
 * Check if any hours are recorded in an hours dictionary.
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
      const { isOpen, currentDay, currentFrame, statusText } =
        getLiveOpeningStatus(openingTimes, now)

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
