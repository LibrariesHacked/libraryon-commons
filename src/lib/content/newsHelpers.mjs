/**
 * @fileoverview Server-side News dataset helpers and accessors for Public Libraries News integration.
 * Loads pre-indexed news stories, metadata, and entity summaries at build time and enriches records
 * with internal authority and library branch URLs.
 */

import { existsSync, readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import {
  authorities as directoryAuthorities,
  libraries as directoryLibraries
} from '../directory/directoryLoader.mjs'

export {
  CATEGORY_LABELS,
  CHANGE_TYPE_LABELS,
  CATEGORY_COLORS,
  ORG_SLUG_MAP,
  categoryColor,
  categoryLabel,
  changeTypeLabel,
  formatNewsDate,
  filterStoriesByDate,
  getOrgSlug,
  joinBaseUrl,
  authorityPageUrl,
  organisationPageUrl,
  newsExplorerUrl,
  matchesStoryQuery,
  storiesToLocationGeoJson
} from './newsFormatHelpers.mjs'

let cachedByAuthority = null
let cachedByLibrary = null
let cachedByOrganisation = null
let cachedMetadata = null
let cachedSummaries = null
let cachedNewsIndex = null
const cachedArchives = new Map()
let cachedCrossReferenceMaps = null

/**
 * Read and parse a JSON file from `src/data/news/`.
 *
 * @param {string} filename - Name of the JSON file inside `src/data/news/`.
 * @returns {any|null} Parsed JSON payload, or null if the file does not exist.
 */
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

/**
 * Build and cache cross-reference lookup maps linking news stories to canonical
 * directory authority slugs and library branch URLs.
 *
 * @returns {{
 *   authoritySlugByGss: Map<string, string>,
 *   authoritySlugByNameLower: Map<string, string>,
 *   authoritySlugsByName: Record<string, string>,
 *   storyLibrariesById: Map<number|string, Array<{ name: string, url?: string }>>
 * }} Cross-reference lookup maps.
 */
function getCrossReferenceMaps() {
  if (cachedCrossReferenceMaps) return cachedCrossReferenceMaps

  const authoritySlugByGss = new Map()
  const authoritySlugByNameLower = new Map()
  for (const authority of directoryAuthorities || []) {
    if (authority.gss && authority.slug) {
      authoritySlugByGss.set(authority.gss, authority.slug)
    }
    if (authority.name && authority.slug) {
      authoritySlugByNameLower.set(authority.name.toLowerCase(), authority.slug)
    }
  }

  const rawMetadata = loadJson('news-metadata.json') || {}
  const gssByNameLower = rawMetadata.authority_gss_by_name || {}
  const authoritySlugsByName = { ...(rawMetadata.authority_slugs_by_name || {}) }

  for (const authorityName of Object.keys(rawMetadata.authorities || {})) {
    const lowerName = authorityName.toLowerCase()
    const gssCode = gssByNameLower[lowerName]
    const resolvedSlug =
      (gssCode && authoritySlugByGss.get(gssCode)) || authoritySlugByNameLower.get(lowerName) || null
    if (resolvedSlug) {
      authoritySlugsByName[authorityName] = resolvedSlug
      authoritySlugByNameLower.set(lowerName, resolvedSlug)
    }
  }

  const libraryById = new Map()
  for (const library of directoryLibraries || []) {
    if (library.id && library.name) {
      libraryById.set(library.id, { name: library.name, url: library.url || null })
    }
  }

  if (!cachedByLibrary) {
    cachedByLibrary = loadJson('stories-by-library.json') || {}
  }

  const storyLibrariesById = new Map()
  for (const [libraryId, stories] of Object.entries(cachedByLibrary)) {
    const libraryInfo = libraryById.get(libraryId)
    if (!libraryInfo || !Array.isArray(stories)) continue
    const branchEntry = libraryInfo.url
      ? { name: libraryInfo.name, url: libraryInfo.url }
      : { name: libraryInfo.name }
    for (const story of stories) {
      if (!story?.id) continue
      let branchList = storyLibrariesById.get(story.id)
      if (!branchList) {
        branchList = []
        storyLibrariesById.set(story.id, branchList)
      }
      const alreadyIncluded = branchList.some(
        (item) => item.name === branchEntry.name && item.url === branchEntry.url
      )
      if (!alreadyIncluded) {
        branchList.push(branchEntry)
      }
    }
  }

  cachedCrossReferenceMaps = {
    authoritySlugByGss,
    authoritySlugByNameLower,
    authoritySlugsByName,
    storyLibrariesById
  }
  return cachedCrossReferenceMaps
}

/**
 * Resolve a directory URL slug for a local authority by its display name or GSS code.
 *
 * @param {string} authorityName - Display name of the local authority.
 * @param {string|null} [gssCode=null] - Optional 9-character ONS GSS code.
 * @returns {string|null} Canonical authority URL slug, or null if not matched in the directory.
 */
export function resolveAuthoritySlug(authorityName, gssCode = null) {
  const { authoritySlugByGss, authoritySlugByNameLower } = getCrossReferenceMaps()
  if (gssCode && authoritySlugByGss.has(gssCode)) return authoritySlugByGss.get(gssCode)
  if (authorityName) {
    const lowerName = String(authorityName).toLowerCase()
    if (authoritySlugByNameLower.has(lowerName)) return authoritySlugByNameLower.get(lowerName)
  }
  return null
}

/**
 * Enrich a single news story object with its resolved `authority_slug` and mentioned
 * `libraries` branch list so templates and cards can link directly to directory pages.
 *
 * @param {object} story - Raw news story record.
 * @returns {object} Enriched news story record.
 */
export function enrichNewsStory(story) {
  if (!story || typeof story !== 'object') return story
  if (story._enriched) return story
  const { authoritySlugByNameLower, storyLibrariesById } = getCrossReferenceMaps()

  let authoritySlug = story.authority_slug || null
  if (!authoritySlug && story.authority_name) {
    authoritySlug =
      authoritySlugByNameLower.get(String(story.authority_name).toLowerCase()) || null
  }

  let libraries = null
  if (Array.isArray(story.libraries) && story.libraries.length > 0) {
    libraries = story.libraries
  } else {
    libraries = storyLibrariesById.get(story.id) || null
  }

  const enriched = {
    ...story,
    ...(authoritySlug ? { authority_slug: authoritySlug } : {}),
    ...(libraries && libraries.length > 0
      ? {
          libraries,
          library_names: libraries.map((library) => library.name)
        }
      : {})
  }
  Object.defineProperty(enriched, '_enriched', { value: true, enumerable: false })
  return enriched
}

/**
 * Enrich an array of news story records with directory authority slugs and branch links.
 *
 * @param {Array<object>} stories - Array of raw news story records.
 * @returns {Array<object>} Array of enriched news story records.
 */
export function enrichNewsStories(stories) {
  if (!Array.isArray(stories)) return []
  return stories.map(enrichNewsStory)
}

/**
 * Retrieve all news stories matched to a specific library building by its directory ID.
 *
 * @param {string} libraryId - Canonical library building identifier.
 * @returns {Array<object>} Enriched news stories mentioning the library.
 */
export function getNewsForLibrary(libraryId) {
  if (!cachedByLibrary) {
    cachedByLibrary = loadJson('stories-by-library.json') || {}
  }
  return enrichNewsStories(cachedByLibrary[libraryId] || [])
}

/**
 * Retrieve all news stories for a local authority by its GSS code, URL slug, or display name.
 *
 * @param {string} gssCode - Nine-character ONS GSS code.
 * @param {string} slug - Authority URL slug.
 * @param {string} name - Authority display name.
 * @returns {Array<object>} Enriched news stories for the authority.
 */
export function getNewsForAuthority(gssCode, slug, name) {
  if (!cachedByAuthority) {
    cachedByAuthority = loadJson('stories-by-authority.json') || {}
  }
  if (gssCode && cachedByAuthority[gssCode]) {
    return enrichNewsStories(cachedByAuthority[gssCode])
  }
  const metadata = getNewsMetadata()
  const resolvedGss =
    (name && metadata.authority_gss_by_name?.[name.toLowerCase()]) ||
    (slug && metadata.authority_gss_by_name?.[slug.toLowerCase()])
  if (resolvedGss && cachedByAuthority[resolvedGss]) {
    return enrichNewsStories(cachedByAuthority[resolvedGss])
  }
  if (name) {
    const lowerName = name.toLowerCase()
    if (cachedByAuthority[lowerName]) return enrichNewsStories(cachedByAuthority[lowerName])
  }
  if (slug) {
    const lowerSlug = slug.toLowerCase()
    if (cachedByAuthority[lowerSlug]) return enrichNewsStories(cachedByAuthority[lowerSlug])
  }
  return []
}

/**
 * Retrieve all news stories mentioning a sector stakeholder organisation by its URL slug.
 *
 * @param {string} organisationSlug - Canonical organisation URL slug (e.g. "cilip").
 * @returns {Array<object>} Enriched news stories mentioning the organisation.
 */
export function getNewsForOrganisation(organisationSlug) {
  if (!cachedByOrganisation) {
    cachedByOrganisation = loadJson('stories-by-organisation.json') || {}
  }
  return enrichNewsStories(cachedByOrganisation[organisationSlug] || [])
}

/**
 * Retrieve the primary recent news story index used by `/news.json` and the `/news/` page.
 *
 * @returns {Array<object>} Enriched news index stories.
 */
export function getNewsIndexStories() {
  if (!cachedNewsIndex) {
    cachedNewsIndex = enrichNewsStories(loadJson('news-index.json') || [])
  }
  return cachedNewsIndex
}

/**
 * Retrieve an archive time-slice shard of historical news stories (such as "2y", "3y", "5y", or "all").
 *
 * @param {string} range - Archive shard identifier.
 * @returns {Array<object>|null} Enriched archive stories, or null if the shard does not exist.
 */
export function getNewsArchiveStories(range) {
  if (!cachedArchives.has(range)) {
    const rawArchive = loadJson(`archive-${range}.json`)
    cachedArchives.set(range, rawArchive ? enrichNewsStories(rawArchive) : null)
  }
  return cachedArchives.get(range)
}

/**
 * Retrieve pre-computed summary statistics across all organisations, authorities, and libraries.
 *
 * @returns {{ organisations: Record<string, object>, authorities: Record<string, object>, libraries: Record<string, object> }}
 */
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

/**
 * Retrieve pre-computed news summary statistics for a sector organisation by its URL slug.
 *
 * @param {string} organisationSlug - Canonical organisation URL slug.
 * @returns {object|null} Summary statistics object, or null if unavailable.
 */
export function getNewsSummaryForOrganisation(organisationSlug) {
  const summaries = getNewsSummaries()
  return summaries.organisations?.[organisationSlug] || null
}

/**
 * Retrieve pre-computed news summary statistics for a local authority by GSS code, slug, or name.
 *
 * @param {string} gssCode - Nine-character ONS GSS code.
 * @param {string} slug - Authority URL slug.
 * @param {string} name - Authority display name.
 * @returns {object|null} Summary statistics object, or null if unavailable.
 */
export function getNewsSummaryForAuthority(gssCode, slug, name) {
  const summaries = getNewsSummaries()
  if (gssCode && summaries.authorities?.[gssCode]) {
    return summaries.authorities[gssCode]
  }
  const metadata = getNewsMetadata()
  const resolvedGss =
    (name && metadata.authority_gss_by_name?.[name.toLowerCase()]) ||
    (slug && metadata.authority_gss_by_name?.[slug.toLowerCase()])
  if (resolvedGss && summaries.authorities?.[resolvedGss]) {
    return summaries.authorities[resolvedGss]
  }
  if (name) {
    const lowerName = name.toLowerCase()
    if (summaries.authorities?.[lowerName]) return summaries.authorities[lowerName]
  }
  if (slug) {
    const lowerSlug = slug.toLowerCase()
    if (summaries.authorities?.[lowerSlug]) return summaries.authorities[lowerSlug]
  }
  return null
}

/**
 * Retrieve pre-computed news summary statistics for a specific library branch by its ID.
 *
 * @param {string} libraryId - Canonical library building identifier.
 * @returns {object|null} Summary statistics object, or null if unavailable.
 */
export function getNewsSummaryForLibrary(libraryId) {
  const summaries = getNewsSummaries()
  return summaries.libraries?.[libraryId] || null
}

/**
 * Retrieve aggregate news dataset metadata (story counts, categories, change types,
 * organisations, and authority slug mappings).
 *
 * @returns {object} News metadata object.
 */
export function getNewsMetadata() {
  if (!cachedMetadata) {
    const rawMetadata = loadJson('news-metadata.json') || {
      total_stories: 0,
      categories: {},
      change_types: {},
      countries: {},
      organisations: {},
      authorities: {}
    }
    const { authoritySlugsByName } = getCrossReferenceMaps()
    cachedMetadata = {
      ...rawMetadata,
      authority_slugs_by_name: authoritySlugsByName
    }
  }
  return cachedMetadata
}
