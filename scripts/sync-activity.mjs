/**
 * @fileoverview Ingests and normalizes headline authority usage figures from the
 * Arts Council England Public Libraries Activity Dataset into a compact advocacy-focused
 * lookup for LibraryCommons authority pages.
 */

import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const outputFile = path.join(rootDir, 'src', 'data', 'activity', 'activity-by-authority.json')

const REMOTE_BASE_URL =
  'https://raw.githubusercontent.com/LibrariesHacked/public-libraries-activity-dataset/main/public'

/**
 * Locate a local checkout of the `public-libraries-activity-dataset` repository if present.
 * Returns null when no local directory is found so the script can fall back to GitHub raw URLs.
 *
 * @returns {string|null} Absolute directory path containing `services.json`, or null.
 */
export function resolveActivityDataDir() {
  const candidates = [
    process.env.ACTIVITY_DATA_DIR ? path.resolve(process.env.ACTIVITY_DATA_DIR) : null,
    path.resolve(rootDir, '..', 'public-libraries-activity-dataset', 'public'),
    path.resolve(rootDir, '..', 'public-libraries-activity-dataset', 'dist'),
    path.resolve(rootDir, 'public-libraries-activity-dataset', 'public')
  ].filter(Boolean)

  return candidates.find((directory) => existsSync(path.join(directory, 'services.json'))) || null
}

/**
 * Load a JSON dataset file from a local checkout if available, or fetch it from GitHub.
 *
 * @param {string} filename - Dataset JSON filename (e.g. "services.json").
 * @param {string|null} localDir - Local dataset directory path, if available.
 * @returns {Promise<any>} Parsed JSON payload.
 */
async function loadDatasetJson(filename, localDir) {
  if (localDir) {
    const filePath = path.join(localDir, filename)
    if (existsSync(filePath)) {
      return JSON.parse(readFileSync(filePath, 'utf8'))
    }
  }
  const response = await fetch(`${REMOTE_BASE_URL}/${filename}`)
  if (!response.ok) {
    throw new Error(`Failed to fetch ${filename}: ${response.status}`)
  }
  return response.json()
}

/**
 * Resolve the effective numeric value for an activity dataset metric cell.
 * Uses the estimated replacement value when a record is marked "replaced",
 * and omits excluded, zero, or negative values.
 *
 * @param {number|string|null} originalValue - Raw submitted metric value.
 * @param {number|string|null} estimatedValue - Replacement estimate when flagged.
 * @param {string|null} status - Quality status flag ("excluded", "replaced", or null).
 * @returns {number|null} Positive rounded integer metric, or null if unreported/excluded.
 */
export function resolveEffectiveMetric(originalValue, estimatedValue, status) {
  if (status === 'excluded') return null
  const candidate =
    status === 'replaced' && estimatedValue !== null && estimatedValue !== undefined
      ? Number(estimatedValue)
      : Number(originalValue)
  if (!Number.isFinite(candidate) || candidate <= 0) return null
  return Math.round(candidate)
}

/**
 * Map a "YYYY-MM" calendar month string to its UK financial year period ("YYYY/YYYY").
 * The UK public library financial year runs from 1 April to 31 March.
 *
 * @param {string} monthString - Calendar month in "YYYY-MM" format (e.g. "2025-04").
 * @returns {string|null} Financial year period string (e.g. "2025/2026"), or null if invalid.
 */
export function monthToFinancialPeriod(monthString) {
  if (!monthString || typeof monthString !== 'string') return null
  const [yearString, monthPart] = monthString.split('-')
  const year = parseInt(yearString, 10)
  const month = parseInt(monthPart, 10)
  if (!Number.isFinite(year) || !Number.isFinite(month)) return null
  if (month >= 4) {
    return `${year}/${year + 1}`
  }
  return `${year - 1}/${year}`
}

const METRIC_OFFSETS = {
  users: 4,
  events: 8,
  attendance: 12,
  loans: 16,
  visits: 20,
  computerHours: 24,
  wifiSessions: 28
}

/**
 * Aggregate annual service returns, borrower age breakdowns, loan formats, outreach visits,
 * and computer inventory into a normalized lookup keyed by authority GSS code.
 * Applies completeness guards so partial returns fall back to the latest complete year.
 *
 * @returns {Promise<Record<string, object>>} Normalized activity records keyed by GSS code.
 */
export async function buildActivityByAuthority() {
  const localDir = resolveActivityDataDir()
  const [servicesRaw, usersRaw, loansPayload, visitsRaw, computerInventoryRaw] = await Promise.all([
    loadDatasetJson('services.json', localDir),
    loadDatasetJson('users.json', localDir).catch(() => []),
    loadDatasetJson('loans.json', localDir).catch(() => []),
    loadDatasetJson('visits.json', localDir).catch(() => []),
    loadDatasetJson('computer_inventory.json', localDir).catch(() => [])
  ])

  const loansRaw = Array.isArray(loansPayload) ? loansPayload : loansPayload?.records || []

  // 1. Pre-aggregate under-18 active borrowers by (gssCode, period)
  const under18UsersByKey = new Map()
  for (const row of usersRaw) {
    const [gssCode, period, ageGroup, originalValue, estimatedValue, status] = row
    if (ageGroup !== 'Under 12' && ageGroup !== '12-17') continue
    const effectiveValue = resolveEffectiveMetric(originalValue, estimatedValue, status)
    if (!effectiveValue) continue
    const lookupKey = `${gssCode}::${period}`
    under18UsersByKey.set(lookupKey, (under18UsersByKey.get(lookupKey) || 0) + effectiveValue)
  }

  // 2. Pre-aggregate digital loans (Ebook + Eaudio) and children's/teen loans by (gssCode, period)
  const digitalLoansByKey = new Map()
  const childrenLoansByKey = new Map()
  for (const row of loansRaw) {
    const [gssCode, format, ageGroup, month, originalValue, estimatedValue, status] = row
    const effectiveValue = resolveEffectiveMetric(originalValue, estimatedValue, status)
    if (!effectiveValue) continue
    const period = monthToFinancialPeriod(month)
    if (!period) continue
    const lookupKey = `${gssCode}::${period}`
    if (format === 'Ebook' || format === 'Eaudio') {
      digitalLoansByKey.set(lookupKey, (digitalLoansByKey.get(lookupKey) || 0) + effectiveValue)
    }
    if (ageGroup === 'Under 12' || ageGroup === '12-17') {
      childrenLoansByKey.set(lookupKey, (childrenLoansByKey.get(lookupKey) || 0) + effectiveValue)
    }
  }

  // 3. Pre-aggregate mobile & home delivery outreach visits by (gssCode, period)
  const outreachVisitsByKey = new Map()
  for (const row of visitsRaw) {
    const [gssCode, location, month, originalValue, estimatedValue, status] = row
    if (location !== 'Mobile library' && location !== 'Home delivery') continue
    const effectiveValue = resolveEffectiveMetric(originalValue, estimatedValue, status)
    if (!effectiveValue) continue
    const period = monthToFinancialPeriod(month)
    if (!period) continue
    const lookupKey = `${gssCode}::${period}`
    outreachVisitsByKey.set(lookupKey, (outreachVisitsByKey.get(lookupKey) || 0) + effectiveValue)
  }

  // 4. Pre-aggregate public computers & devices in service by (gssCode, period)
  const devicesByKey = new Map()
  for (const row of computerInventoryRaw) {
    const [gssCode, category, period, , originalValue, estimatedValue, status] = row
    if (category !== 'Computers and devices in service') continue
    const effectiveValue = resolveEffectiveMetric(originalValue, estimatedValue, status)
    if (!effectiveValue) continue
    const lookupKey = `${gssCode}::${period}`
    devicesByKey.set(lookupKey, effectiveValue)
  }

  // 5. Group annual service rows by GSS code
  const rowsByCode = new Map()
  for (const row of servicesRaw) {
    const gssCode = row[0]
    if (!gssCode) continue
    if (!rowsByCode.has(gssCode)) rowsByCode.set(gssCode, [])
    rowsByCode.get(gssCode).push(row)
  }

  const byAuthority = {}

  for (const [gssCode, rows] of rowsByCode.entries()) {
    // Sort newest period first (e.g. '2025/2026', '2024/2025', '2023/2024')
    rows.sort((firstRow, secondRow) =>
      String(secondRow[3] || '').localeCompare(String(firstRow[3] || ''))
    )

    const parsedYears = rows.map((row) => {
      const period = row[3]
      const populationUnder12 = Number(row[32]) || 0
      const population12To17 = Number(row[33]) || 0
      const populationAdult = Number(row[34]) || 0
      const population = populationUnder12 + population12To17 + populationAdult

      const metrics = {}
      for (const [metricKey, offset] of Object.entries(METRIC_OFFSETS)) {
        metrics[metricKey] = resolveEffectiveMetric(row[offset], row[offset + 1], row[offset + 2])
      }

      return {
        code: gssCode,
        name: row[1] || '',
        serviceName: row[2] || '',
        period,
        population,
        metrics
      }
    })

    // Find latest financial year with at least one positive metric
    const primaryYear = parsedYears.find((yearRecord) =>
      Object.values(yearRecord.metrics).some((metricValue) => metricValue !== null && metricValue > 0)
    )
    if (!primaryYear) continue

    const population = primaryYear.population
    const resolvedMetrics = {}

    for (const metricKey of Object.keys(METRIC_OFFSETS)) {
      const candidates = parsedYears.filter((yearRecord) => yearRecord.metrics[metricKey] !== null)
      if (!candidates.length) continue

      let chosenYear = candidates[0]

      // Guard against incomplete partial returns (such as outreach-only visits or 1-month PC returns)
      // or combined-authority duplicate entries (such as Torbay reporting Devon's 2.2M total visits)
      if (metricKey === 'visits' && population > 0) {
        const chosenRatePerThousand = (chosenYear.metrics.visits / population) * 1000
        if (chosenRatePerThousand < 200 || (gssCode !== 'E09000001' && chosenRatePerThousand > 10000)) {
          const completeAlternative = candidates.find((yearRecord) => {
            const ratePerThousand = (yearRecord.metrics.visits / population) * 1000
            return ratePerThousand >= 300 && (gssCode === 'E09000001' || ratePerThousand <= 10000)
          })
          if (completeAlternative) {
            chosenYear = completeAlternative
          } else {
            continue
          }
        }
      } else if (metricKey === 'users' && population > 0 && gssCode !== 'E09000001') {
        const chosenRatio = chosenYear.metrics.users / population
        if (chosenRatio > 0.65) {
          const validAlternative = candidates.find(
            (yearRecord) => yearRecord.metrics.users / population <= 0.65
          )
          if (validAlternative) {
            chosenYear = validAlternative
          } else {
            continue
          }
        }
      } else if (metricKey === 'computerHours' && population > 0) {
        const chosenRatePerThousand = (chosenYear.metrics.computerHours / population) * 1000
        if (chosenRatePerThousand < 15) {
          const completeAlternative = candidates.find(
            (yearRecord) => (yearRecord.metrics.computerHours / population) * 1000 >= 50
          )
          if (completeAlternative) chosenYear = completeAlternative
        }
      }

      const value = chosenYear.metrics[metricKey]
      const period = chosenYear.period

      // Check positive growth from earliest reported year for this metric (advocacy highlight)
      const allYearsForMetric = candidates.filter((yearRecord) => yearRecord.period <= period)
      const earliestForMetric = allYearsForMetric[allYearsForMetric.length - 1]
      const earliestValue = earliestForMetric?.metrics[metricKey]
      let growthPercentage = null
      let baselinePeriod = null
      if (earliestForMetric && earliestForMetric.period !== period && earliestValue > 0) {
        const rawPercentage = ((value - earliestValue) / earliestValue) * 100
        if (rawPercentage >= 2 && rawPercentage <= 250) {
          growthPercentage = Math.round(rawPercentage)
          baselinePeriod = earliestForMetric.period
        }
      }

      const item = {
        total: value,
        period,
        ...(growthPercentage
          ? { growth_pct: growthPercentage, baseline_period: baselinePeriod }
          : {})
      }

      const lookupKey = `${gssCode}::${period}`

      if (metricKey === 'visits') {
        if (population > 0) item.per_1k = Math.round((value / population) * 1000)
        const outreach = outreachVisitsByKey.get(lookupKey)
        if (outreach && outreach > 0 && outreach < value) {
          item.outreach_visits = outreach
        }
      } else if (metricKey === 'loans') {
        if (population > 0) item.per_1k = Math.round((value / population) * 1000)
        const digital = digitalLoansByKey.get(lookupKey)
        if (digital && digital > 0 && digital < value) {
          item.digital_loans = digital
        }
        const children = childrenLoansByKey.get(lookupKey)
        if (children && children > 0 && children < value) {
          item.children_loans = children
        }
      } else if (metricKey === 'users') {
        if (population > 0) {
          const residentPercentage = Number(((value / population) * 100).toFixed(1))
          if (residentPercentage > 0 && residentPercentage <= 65) {
            item.resident_pct = residentPercentage
          }
        }
        const under18 = under18UsersByKey.get(lookupKey)
        if (under18 && under18 > 0 && under18 < value) {
          item.under18_users = under18
        }
      } else if (metricKey === 'events') {
        if (population > 0) item.per_1k = Number(((value / population) * 1000).toFixed(1))
      } else if (metricKey === 'attendance') {
        if (population > 0) item.per_1k = Math.round((value / population) * 1000)
      } else if (metricKey === 'computerHours') {
        if (population > 0) item.per_1k = Math.round((value / population) * 1000)
        const devices =
          devicesByKey.get(lookupKey) ||
          devicesByKey.get(`${gssCode}::${primaryYear.period}`) ||
          devicesByKey.get(`${gssCode}::2024/2025`) ||
          devicesByKey.get(`${gssCode}::2023/2024`)
        if (devices && devices > 0) {
          item.devices_count = devices
        }
      } else if (metricKey === 'wifiSessions') {
        if (population > 0) item.per_1k = Math.round((value / population) * 1000)
      }

      resolvedMetrics[metricKey] = item
    }

    byAuthority[gssCode] = {
      gss: gssCode,
      name: primaryYear.name,
      period: primaryYear.period,
      population,
      metrics: resolvedMetrics
    }
  }

  return byAuthority
}

/**
 * Write the normalized authority activity lookup file to `src/data/activity/activity-by-authority.json`.
 *
 * @returns {Promise<void>}
 */
export async function syncActivity() {
  mkdirSync(path.dirname(outputFile), { recursive: true })
  const byAuthority = await buildActivityByAuthority()
  const count = Object.keys(byAuthority).length
  if (!count) {
    throw new Error('No authority activity records generated; aborting.')
  }
  if (existsSync(outputFile)) {
    try {
      unlinkSync(outputFile)
    } catch {
      // Ignore if unlink not needed
    }
  }
  writeFileSync(outputFile, JSON.stringify(byAuthority, null, 2) + '\n', 'utf8')
  console.log(`Wrote activity-by-authority.json (${count} English authorities).`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  syncActivity().catch((error) => {
    console.error('Error syncing activity dataset:', error)
    process.exit(1)
  })
}
