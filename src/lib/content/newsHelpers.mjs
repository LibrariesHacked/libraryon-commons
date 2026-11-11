/**
 * @fileoverview News dataset helpers and accessors for Public Libraries News integration.
 */

import { existsSync, readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

let cachedByAuthority = null
let cachedByLibrary = null
let cachedByOrganisation = null
let cachedMetadata = null
let cachedSummaries = null

function loadJson(filename) {
  const localUrl = new URL(`../../data/news/${filename}`, import.meta.url)
  if (existsSync(localUrl)) {
    return JSON.parse(readFileSync(localUrl, 'utf8'))
  }
  const rootUrl = new URL(`./src/data/news/${filename}`, pathToFileURL(`${process.cwd()}/`))
  if (existsSync(rootUrl)) {
    return JSON.parse(readFileSync(rootUrl, 'utf8'))
  }
  return null
}

export const CATEGORY_LABELS = {
  cuts_and_finance: 'Cuts & Finance',
  closures_and_threats: 'Closures & Threats',
  staffing_and_unions: 'Staffing & Unions',
  events_and_activities: 'Events & Activities',
  campaigns_and_protests: 'Campaigns & Protests',
  volunteers_and_community: 'Volunteers & Community',
  digital_and_technology: 'Digital & Technology',
  refurbishment_and_new_builds: 'Refurbishment & New Builds',
  opening_hours: 'Opening Hours',
  book_bans_and_challenges: 'Book Bans & Challenges',
  mobile_and_outreach: 'Mobile & Outreach',
  governance_and_trusts: 'Governance & Trusts',
  co_location: 'Co-location & Hubs',
  warm_spaces_and_wellbeing: 'Warm Spaces & Wellbeing',
  unstaffed_open_plus: 'Unstaffed Open+'
}

export const CHANGE_TYPE_LABELS = {
  closure: 'Closure',
  reduction_or_cut: 'Reduction or Cut',
  community_handover: 'Community Handover',
  investment_or_expansion: 'Investment or Expansion',
  unstaffed_open_plus: 'Unstaffed Open+',
  other: 'Sector Change'
}

export const CATEGORY_COLORS = {
  // Threats, Cuts & Activism -> rose
  cuts_and_finance: 'rose',
  closures_and_threats: 'rose',
  campaigns_and_protests: 'rose',
  book_bans_and_challenges: 'rose',

  // Buildings, Places & Wellbeing -> green
  refurbishment_and_new_builds: 'green',
  mobile_and_outreach: 'green',
  co_location: 'green',
  warm_spaces_and_wellbeing: 'green',

  // Operations & Technology -> apricot
  digital_and_technology: 'apricot',
  opening_hours: 'apricot',
  unstaffed_open_plus: 'apricot',

  // People, Community & Governance -> plum
  events_and_activities: 'plum',
  volunteers_and_community: 'plum',
  staffing_and_unions: 'plum',
  governance_and_trusts: 'plum'
}

export function categoryColor(key) {
  return CATEGORY_COLORS[key] || 'plum'
}

export function categoryLabel(key) {
  return CATEGORY_LABELS[key] || (key ? key.replace(/_/g, ' ') : '')
}

export function changeTypeLabel(key) {
  return CHANGE_TYPE_LABELS[key] || (key ? key.replace(/_/g, ' ') : '')
}

export function formatNewsDate(dateStr) {
  if (!dateStr) return ''
  try {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return dateStr
    return d.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    })
  } catch {
    return dateStr
  }
}

export function getNewsForLibrary(libraryId) {
  if (!cachedByLibrary) {
    cachedByLibrary = loadJson('stories-by-library.json') || {}
  }
  return cachedByLibrary[libraryId] || []
}

export function getNewsForAuthority(gssCode, slug, name) {
  if (!cachedByAuthority) {
    cachedByAuthority = loadJson('stories-by-authority.json') || {}
  }
  if (gssCode && cachedByAuthority[gssCode]) {
    return cachedByAuthority[gssCode]
  }
  const meta = getNewsMetadata()
  const resolvedGss =
    (name && meta.authority_gss_by_name?.[name.toLowerCase()]) ||
    (slug && meta.authority_gss_by_name?.[slug.toLowerCase()])
  if (resolvedGss && cachedByAuthority[resolvedGss]) {
    return cachedByAuthority[resolvedGss]
  }
  if (name) {
    const key = name.toLowerCase()
    if (cachedByAuthority[key]) return cachedByAuthority[key]
  }
  if (slug) {
    const key = slug.toLowerCase()
    if (cachedByAuthority[key]) return cachedByAuthority[key]
  }
  return []
}

export function getNewsForOrganisation(orgSlug) {
  if (!cachedByOrganisation) {
    cachedByOrganisation = loadJson('stories-by-organisation.json') || {}
  }
  return cachedByOrganisation[orgSlug] || []
}

export function getNewsSummaries() {
  if (!cachedSummaries) {
    cachedSummaries = loadJson('news-summaries.json') || {
      organisations: {},
      authorities: {},
      libraries: {}
    }
  }
  return cachedSummaries
}

export function getNewsSummaryForOrganisation(orgSlug) {
  const summaries = getNewsSummaries()
  return summaries.organisations?.[orgSlug] || null
}

export function getNewsSummaryForAuthority(gssCode, slug, name) {
  const summaries = getNewsSummaries()
  if (gssCode && summaries.authorities?.[gssCode]) {
    return summaries.authorities[gssCode]
  }
  const meta = getNewsMetadata()
  const resolvedGss =
    (name && meta.authority_gss_by_name?.[name.toLowerCase()]) ||
    (slug && meta.authority_gss_by_name?.[slug.toLowerCase()])
  if (resolvedGss && summaries.authorities?.[resolvedGss]) {
    return summaries.authorities[resolvedGss]
  }
  if (name) {
    const key = name.toLowerCase()
    if (summaries.authorities?.[key]) return summaries.authorities[key]
  }
  if (slug) {
    const key = slug.toLowerCase()
    if (summaries.authorities?.[key]) return summaries.authorities[key]
  }
  return null
}

export function getNewsSummaryForLibrary(libraryId) {
  const summaries = getNewsSummaries()
  return summaries.libraries?.[libraryId] || null
}

export function filterStoriesByDate(stories, options = {}) {
  if (!Array.isArray(stories)) return []
  const { preset = '1y', from = '', to = '', anchorDate } = options

  if (preset === 'all') return stories

  let minDate = from || ''
  let maxDate = to || ''

  if (preset === '1y' || preset === '2y' || preset === '3y' || preset === '5y') {
    const years = preset === '1y' ? 1 : preset === '2y' ? 2 : preset === '3y' ? 3 : 5
    const anchor = anchorDate
      ? new Date(anchorDate)
      : stories[0]?.date
        ? new Date(stories[0].date)
        : new Date()
    const cutoff = new Date(anchor)
    cutoff.setFullYear(cutoff.getFullYear() - years)
    minDate = cutoff.toISOString().slice(0, 10)
  }

  return stories.filter((story) => {
    const d = story.date || ''
    if (minDate && d && d < minDate) return false
    if (maxDate && d && d > maxDate) return false
    return true
  })
}

export function getNewsMetadata() {
  if (!cachedMetadata) {
    cachedMetadata = loadJson('news-metadata.json') || {
      total_stories: 0,
      categories: {},
      change_types: {},
      countries: {},
      organisations: {},
      authorities: {}
    }
  }
  return cachedMetadata
}
