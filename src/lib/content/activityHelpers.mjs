/**
 * @fileoverview Server-side helpers for loading Arts Council England library activity records
 * and building advocacy-focused community impact summaries for authority pages.
 */

import { existsSync, readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

let cachedActivityByAuthority = null

/**
 * Load and cache the normalized authority activity lookup table from disk.
 * Falls back to an empty object if the dataset file is missing or malformed.
 *
 * @returns {Record<string, object>} Activity records keyed by 9-character GSS authority code.
 */
function loadActivityByAuthority() {
  if (cachedActivityByAuthority) return cachedActivityByAuthority

  const localUrl = new URL('../../data/activity/activity-by-authority.json', import.meta.url)
  if (existsSync(localUrl)) {
    try {
      cachedActivityByAuthority = JSON.parse(readFileSync(localUrl, 'utf8'))
      return cachedActivityByAuthority
    } catch (error) {
      console.warn('Could not parse activity-by-authority.json:', error.message)
      cachedActivityByAuthority = {}
      return cachedActivityByAuthority
    }
  }

  const rootUrl = new URL(
    './src/data/activity/activity-by-authority.json',
    pathToFileURL(`${process.cwd()}/`)
  )
  if (existsSync(rootUrl)) {
    try {
      cachedActivityByAuthority = JSON.parse(readFileSync(rootUrl, 'utf8'))
      return cachedActivityByAuthority
    } catch (error) {
      console.warn('Could not parse activity-by-authority.json:', error.message)
      cachedActivityByAuthority = {}
      return cachedActivityByAuthority
    }
  }

  cachedActivityByAuthority = {}
  return cachedActivityByAuthority
}

/**
 * Format a four-digit financial year pair (such as "2025/2026") into short display form ("2025/26").
 * Preserves the original string if it does not match a standard four-digit slash-separated pair.
 *
 * @param {string} period - Financial year string from the activity dataset.
 * @returns {string} Compact financial year label for headings and badges.
 */
export function formatActivityPeriod(period) {
  if (!period || typeof period !== 'string') return ''
  const parts = period.split('/')
  if (parts.length === 2 && parts[0].length === 4 && parts[1].length === 4) {
    return `${parts[0]}/${parts[1].slice(2)}`
  }
  return period
}

/**
 * Retrieve the normalized activity record for a local authority by its GSS code.
 * Returns null when no positive headline data is available (for example, authorities
 * in Scotland, Wales, and Northern Ireland outside the Arts Council England dataset,
 * or English authorities without submitted returns).
 *
 * @param {string} gssCode - Nine-character ONS Government Statistical Service code (e.g. "E08000016").
 * @returns {object|null} Normalized authority activity record, or null if unavailable.
 */
export function getActivityForAuthority(gssCode) {
  if (!gssCode) return null
  const byAuthority = loadActivityByAuthority()
  const record = byAuthority[String(gssCode).trim()]
  if (!record || !record.metrics || Object.keys(record.metrics).length === 0) {
    return null
  }
  return record
}

/**
 * Build a positive multi-year growth badge label when a metric has grown by at least 2%.
 * Never returns negative or decline indicators so the presentation remains advocacy-focused.
 *
 * @param {object} metric - Individual metric object containing optional growth_pct and baseline_period.
 * @returns {string|null} Human-readable growth label (e.g. "Up 12% since 2023/24"), or null.
 */
function formatGrowthBadge(metric) {
  if (!metric || !metric.growth_pct || metric.growth_pct < 2) return null
  const baselineShort = formatActivityPeriod(metric.baseline_period)
  if (baselineShort) {
    return `Up ${metric.growth_pct}% since ${baselineShort}`
  }
  return `Up ${metric.growth_pct}%`
}

/**
 * Build an advocacy-focused narrative lead and structured card list for an authority's
 * annual library activity return. Translates raw annual totals into human-scale weekly
 * or daily figures and highlights children's reach, digital borrowing, and outreach visits.
 *
 * @param {object} record - Normalized authority activity record from `getActivityForAuthority`.
 * @param {string} [authorityName] - Display name of the local authority.
 * @returns {{
 *   periodLabel: string,
 *   leadText: string,
 *   cards: Array<{
 *     key: string,
 *     title: string,
 *     value: number,
 *     formattedValue: string,
 *     periodLabel: string,
 *     isDifferentPeriod: boolean,
 *     primaryContext: string,
 *     secondaryContext: string|null,
 *     growthBadge: string|null,
 *     tone: 'plum'|'green'|'apricot'
 *   }>
 * }|null} Advocacy summary and card list, or null when no cards can be constructed.
 */
export function buildAuthorityActivitySummary(record, authorityName) {
  if (!record || !record.metrics) return null
  const metrics = record.metrics
  const displayName = authorityName || record.name || 'Local'
  const periodLabel = formatActivityPeriod(record.period)

  // Build human-friendly advocacy lead sentence from reported headline metrics
  const leadParts = []
  if (metrics.visits?.total > 0) {
    leadParts.push(`welcomed ${metrics.visits.total.toLocaleString('en-GB')} visits`)
  }
  if (metrics.loans?.total > 0) {
    leadParts.push(`issued ${metrics.loans.total.toLocaleString('en-GB')} books and digital loans`)
  }
  if (metrics.attendance?.total > 0 && metrics.events?.total > 0) {
    leadParts.push(
      `brought ${metrics.attendance.total.toLocaleString('en-GB')} people together across ${metrics.events.total.toLocaleString('en-GB')} community events`
    )
  } else if (metrics.events?.total > 0) {
    leadParts.push(`hosted ${metrics.events.total.toLocaleString('en-GB')} free community events`)
  } else if (metrics.attendance?.total > 0) {
    leadParts.push(
      `welcomed ${metrics.attendance.total.toLocaleString('en-GB')} participants to library events`
    )
  } else if (metrics.users?.total > 0 && leadParts.length < 3) {
    leadParts.push(`supported ${metrics.users.total.toLocaleString('en-GB')} active borrowers`)
  }

  let leadText = `Public libraries in ${displayName} provide free books, digital access, and welcoming community spaces.`
  if (leadParts.length === 1) {
    leadText = `In ${periodLabel}, ${displayName} libraries ${leadParts[0]}.`
  } else if (leadParts.length === 2) {
    leadText = `In ${periodLabel}, ${displayName} libraries ${leadParts[0]} and ${leadParts[1]}.`
  } else if (leadParts.length >= 3) {
    leadText = `In ${periodLabel}, ${displayName} libraries ${leadParts[0]}, ${leadParts[1]}, and ${leadParts[2]}.`
  }

  const cards = []

  // 1. In-person & outreach library visits
  if (metrics.visits?.total > 0) {
    const visitsMetric = metrics.visits
    const weeklyVisits = Math.round(visitsMetric.total / 52)
    let primaryContext = 'Welcoming residents into local library spaces'
    if (weeklyVisits >= 100) {
      primaryContext = `Around ${weeklyVisits.toLocaleString('en-GB')} visits every week`
    }

    let secondaryContext = null
    if (visitsMetric.outreach_visits && visitsMetric.outreach_visits >= 50) {
      secondaryContext = `Includes ${visitsMetric.outreach_visits.toLocaleString('en-GB')} mobile library and home delivery visits`
    } else if (
      visitsMetric.per_1k &&
      visitsMetric.per_1k >= 1000 &&
      visitsMetric.per_1k <= 10000
    ) {
      secondaryContext = `Equivalent to ${(visitsMetric.per_1k / 1000).toFixed(1)} visits per local resident`
    }

    cards.push({
      key: 'visits',
      title: 'Library visits',
      value: visitsMetric.total,
      formattedValue: visitsMetric.total.toLocaleString('en-GB'),
      periodLabel: formatActivityPeriod(visitsMetric.period),
      isDifferentPeriod: visitsMetric.period !== record.period,
      primaryContext,
      secondaryContext,
      growthBadge: formatGrowthBadge(visitsMetric),
      tone: 'plum'
    })
  }

  // 2. Physical & digital loans
  if (metrics.loans?.total > 0) {
    const loansMetric = metrics.loans
    const dailyLoans = Math.round(loansMetric.total / 365)
    let primaryContext = 'Print books, audiobooks, and digital reading'
    if (dailyLoans >= 20) {
      primaryContext = `Around ${dailyLoans.toLocaleString('en-GB')} items borrowed every day`
    }

    let secondaryContext = null
    if (loansMetric.children_loans > 0 && loansMetric.digital_loans > 0) {
      secondaryContext = `${loansMetric.children_loans.toLocaleString('en-GB')} children's & teen loans · ${loansMetric.digital_loans.toLocaleString('en-GB')} eBooks & eAudio`
    } else if (loansMetric.children_loans > 0) {
      secondaryContext = `Includes ${loansMetric.children_loans.toLocaleString('en-GB')} children's and teen books borrowed`
    } else if (loansMetric.digital_loans > 0) {
      secondaryContext = `Includes ${loansMetric.digital_loans.toLocaleString('en-GB')} eBooks and eAudiobooks borrowed`
    }

    cards.push({
      key: 'loans',
      title: 'Books & digital loans',
      value: loansMetric.total,
      formattedValue: loansMetric.total.toLocaleString('en-GB'),
      periodLabel: formatActivityPeriod(loansMetric.period),
      isDifferentPeriod: loansMetric.period !== record.period,
      primaryContext,
      secondaryContext,
      growthBadge: formatGrowthBadge(loansMetric),
      tone: 'green'
    })
  }

  // 3. Active borrowers
  if (metrics.users?.total > 0) {
    const usersMetric = metrics.users
    let primaryContext = 'People actively using their library membership'
    if (usersMetric.resident_pct && usersMetric.resident_pct >= 5) {
      primaryContext = `Around ${Math.round(usersMetric.resident_pct)}% of local residents actively borrowing`
    }

    let secondaryContext = null
    if (usersMetric.under18_users && usersMetric.under18_users > 0) {
      secondaryContext = `Includes ${usersMetric.under18_users.toLocaleString('en-GB')} children and young people under 18`
    }

    cards.push({
      key: 'users',
      title: 'Active borrowers',
      value: usersMetric.total,
      formattedValue: usersMetric.total.toLocaleString('en-GB'),
      periodLabel: formatActivityPeriod(usersMetric.period),
      isDifferentPeriod: usersMetric.period !== record.period,
      primaryContext,
      secondaryContext,
      growthBadge: formatGrowthBadge(usersMetric),
      tone: 'apricot'
    })
  }

  // 4. Community events held
  if (metrics.events?.total > 0) {
    const eventsMetric = metrics.events
    const weeklyEvents = Math.round(eventsMetric.total / 52)
    let primaryContext = 'Storytimes, reading groups, and community sessions'
    if (weeklyEvents >= 5) {
      primaryContext = `Around ${weeklyEvents.toLocaleString('en-GB')} sessions and activities every week`
    }

    let secondaryContext = 'Free events connecting local people and families'
    if (metrics.attendance?.total > 0 && eventsMetric.total > 0) {
      const averageParticipants = Math.round(metrics.attendance.total / eventsMetric.total)
      if (averageParticipants >= 5 && averageParticipants <= 200) {
        secondaryContext = `Averaging ${averageParticipants.toLocaleString('en-GB')} participants per activity`
      }
    }

    cards.push({
      key: 'events',
      title: 'Community events held',
      value: eventsMetric.total,
      formattedValue: eventsMetric.total.toLocaleString('en-GB'),
      periodLabel: formatActivityPeriod(eventsMetric.period),
      isDifferentPeriod: eventsMetric.period !== record.period,
      primaryContext,
      secondaryContext,
      growthBadge: formatGrowthBadge(eventsMetric),
      tone: 'plum'
    })
  }

  // 5. Event attendance
  if (metrics.attendance?.total > 0) {
    const attendanceMetric = metrics.attendance
    const weeklyAttendance = Math.round(attendanceMetric.total / 52)
    let primaryContext = 'People taking part in library events and groups'
    if (weeklyAttendance >= 20) {
      primaryContext = `Around ${weeklyAttendance.toLocaleString('en-GB')} people attending each week`
    }

    cards.push({
      key: 'attendance',
      title: 'Event attendance',
      value: attendanceMetric.total,
      formattedValue: attendanceMetric.total.toLocaleString('en-GB'),
      periodLabel: formatActivityPeriod(attendanceMetric.period),
      isDifferentPeriod: attendanceMetric.period !== record.period,
      primaryContext,
      secondaryContext: 'Supporting early literacy, digital skills, and wellbeing',
      growthBadge: formatGrowthBadge(attendanceMetric),
      tone: 'green'
    })
  }

  // 6. Digital access (Public computer hours & Wi-Fi sessions)
  // When 5 cards are already present and both digital metrics are reported, combine them into
  // a single card so the 3-column grid stays balanced at a maximum of 6 cards.
  const shouldCombineDigitalCards =
    cards.length >= 5 && metrics.computerHours?.total > 0 && metrics.wifiSessions?.total > 0

  if (shouldCombineDigitalCards) {
    const computerHoursMetric = metrics.computerHours
    const wifiSessionsMetric = metrics.wifiSessions
    const weeklyHours = Math.round(computerHoursMetric.total / 52)

    let primaryContext = `Around ${weeklyHours.toLocaleString('en-GB')} hours of free PC access every week`
    if (computerHoursMetric.devices_count && computerHoursMetric.devices_count > 0) {
      primaryContext = `Across ${computerHoursMetric.devices_count.toLocaleString('en-GB')} free public computers and devices`
    }

    let secondaryContext = `Plus ${wifiSessionsMetric.total.toLocaleString('en-GB')} free public Wi-Fi sessions`
    if (wifiSessionsMetric.period !== computerHoursMetric.period) {
      secondaryContext = `Plus ${wifiSessionsMetric.total.toLocaleString('en-GB')} free public Wi-Fi sessions (${formatActivityPeriod(wifiSessionsMetric.period)})`
    }

    cards.push({
      key: 'computerHours',
      title: 'Hours of public PC access',
      value: computerHoursMetric.total,
      formattedValue: computerHoursMetric.total.toLocaleString('en-GB'),
      periodLabel: formatActivityPeriod(computerHoursMetric.period),
      isDifferentPeriod: computerHoursMetric.period !== record.period,
      primaryContext,
      secondaryContext,
      growthBadge: formatGrowthBadge(computerHoursMetric) || formatGrowthBadge(wifiSessionsMetric),
      tone: 'apricot'
    })
  } else {
    if (metrics.computerHours?.total > 0) {
      const computerHoursMetric = metrics.computerHours
      const weeklyHours = Math.round(computerHoursMetric.total / 52)

      let primaryContext = `Around ${weeklyHours.toLocaleString('en-GB')} hours of free PC access every week`
      if (computerHoursMetric.devices_count && computerHoursMetric.devices_count > 0) {
        primaryContext = `Across ${computerHoursMetric.devices_count.toLocaleString('en-GB')} free public computers and devices`
      }

      let secondaryContext = 'Helping residents get online, study, and access services'
      if (
        computerHoursMetric.devices_count &&
        computerHoursMetric.devices_count > 0 &&
        weeklyHours >= 20
      ) {
        secondaryContext = `Around ${weeklyHours.toLocaleString('en-GB')} hours of digital access every week`
      }

      cards.push({
        key: 'computerHours',
        title: 'Hours of public PC access',
        value: computerHoursMetric.total,
        formattedValue: computerHoursMetric.total.toLocaleString('en-GB'),
        periodLabel: formatActivityPeriod(computerHoursMetric.period),
        isDifferentPeriod: computerHoursMetric.period !== record.period,
        primaryContext,
        secondaryContext,
        growthBadge: formatGrowthBadge(computerHoursMetric),
        tone: 'apricot'
      })
    }

    if (metrics.wifiSessions?.total > 0 && cards.length < 6) {
      const wifiSessionsMetric = metrics.wifiSessions
      const weeklyWifi = Math.round(wifiSessionsMetric.total / 52)
      let primaryContext = 'Free internet connectivity in local library spaces'
      if (weeklyWifi >= 20) {
        primaryContext = `Around ${weeklyWifi.toLocaleString('en-GB')} free Wi-Fi connections every week`
      }

      cards.push({
        key: 'wifiSessions',
        title: 'Free Wi-Fi sessions',
        value: wifiSessionsMetric.total,
        formattedValue: wifiSessionsMetric.total.toLocaleString('en-GB'),
        periodLabel: formatActivityPeriod(wifiSessionsMetric.period),
        isDifferentPeriod: wifiSessionsMetric.period !== record.period,
        primaryContext,
        secondaryContext: 'Supporting remote study, work, and digital inclusion',
        growthBadge: formatGrowthBadge(wifiSessionsMetric),
        tone: 'plum'
      })
    }
  }

  if (cards.length === 0) return null

  return {
    periodLabel,
    leadText,
    cards
  }
}
