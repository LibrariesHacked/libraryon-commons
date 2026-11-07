/**
 * @fileoverview News dataset helpers and accessors for Public Libraries News integration.
 */

import { existsSync, readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

let cachedByAuthority = null
let cachedByLibrary = null
let cachedByOrganisation = null
let cachedMetadata = null

function loadJson(filename) {
  const localUrl = new URL(`../data/news/${filename}`, import.meta.url)
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

export function categoryLabel(key) {
  return CATEGORY_LABELS[key] || key.replace(/_/g, ' ')
}

export function changeTypeLabel(key) {
  return CHANGE_TYPE_LABELS[key] || key.replace(/_/g, ' ')
}

export function formatNewsDate(dateStr) {
  if (!dateStr) return ''
  try {
    const d = new Date(dateStr)
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
  const resolvedGss = (name && meta.authority_gss_by_name?.[name.toLowerCase()]) ||
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
