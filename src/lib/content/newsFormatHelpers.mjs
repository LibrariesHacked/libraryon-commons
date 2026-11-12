/**
 * @fileoverview Pure, framework-independent helpers for formatting, filtering, and mapping
 * Public Libraries News records at build time and in the browser.
 */

/**
 * Human-readable display labels for news topic categories.
 * @type {Readonly<Record<string, string>>}
 */
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

/**
 * Human-readable display labels for library service change types.
 * @type {Readonly<Record<string, string>>}
 */
export const CHANGE_TYPE_LABELS = {
  closure: 'Closure',
  reduction_or_cut: 'Reduction or Cut',
  community_handover: 'Community Handover',
  investment_or_expansion: 'Investment or Expansion',
  unstaffed_open_plus: 'Unstaffed Open+',
  other: 'Sector Change'
}

/**
 * Brand palette assignments grouping news categories into four thematic colour families.
 * @type {Readonly<Record<string, 'rose'|'green'|'apricot'|'plum'>>}
 */
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

/**
 * Resolve the brand colour token suffix ('rose', 'green', 'apricot', or 'plum') for a category key.
 *
 * @param {string} categoryKey - News category identifier.
 * @returns {'rose'|'green'|'apricot'|'plum'} Brand palette name.
 */
export function categoryColor(categoryKey) {
  return CATEGORY_COLORS[categoryKey] || 'plum'
}

/**
 * Resolve the display label for a news category key, falling back to space-separated words.
 *
 * @param {string} categoryKey - News category identifier.
 * @returns {string} Human-readable category label.
 */
export function categoryLabel(categoryKey) {
  if (!categoryKey) return ''
  return CATEGORY_LABELS[categoryKey] || categoryKey.replace(/_/g, ' ')
}

/**
 * Resolve the display label for a service change type key, falling back to space-separated words.
 *
 * @param {string} changeTypeKey - Service change type identifier.
 * @returns {string} Human-readable change type label.
 */
export function changeTypeLabel(changeTypeKey) {
  if (!changeTypeKey) return ''
  return CHANGE_TYPE_LABELS[changeTypeKey] || changeTypeKey.replace(/_/g, ' ')
}

/**
 * Format an ISO date string into British English short date format (e.g. "2 Nov 2026").
 * Returns the original string if the date cannot be parsed.
 *
 * @param {string|null|undefined} dateString - ISO 8601 date string.
 * @returns {string} Formatted British date string.
 */
export function formatNewsDate(dateString) {
  if (!dateString) return ''
  try {
    const parsedDate = new Date(dateString)
    if (Number.isNaN(parsedDate.getTime())) return dateString
    return parsedDate.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    })
  } catch {
    return dateString
  }
}

const PRESET_YEARS = {
  '1y': 1,
  '2y': 2,
  '3y': 3,
  '5y': 5
}

/**
 * Filter an array of news stories by a relative time preset ("1y", "2y", "3y", "5y", "all")
 * or an explicit ISO date window (`from` / `to`).
 *
 * @param {Array<object>} stories - Array of news story objects with ISO `date` properties.
 * @param {object} [options={}] - Date filter options.
 * @param {string} [options.preset='1y'] - Time window preset ("1y", "2y", "3y", "5y", "all", or "custom").
 * @param {string} [options.from=''] - Optional lower-bound ISO date string ("YYYY-MM-DD").
 * @param {string} [options.to=''] - Optional upper-bound ISO date string ("YYYY-MM-DD").
 * @param {string|Date} [options.anchorDate] - Optional reference date for relative presets.
 * @returns {Array<object>} Filtered stories matching the date range.
 */
export function filterStoriesByDate(stories, options = {}) {
  if (!Array.isArray(stories)) return []
  const { preset = '1y', from = '', to = '', anchorDate } = options

  if (preset === 'all') return stories

  let minDate = from || ''
  const maxDate = to || ''

  const yearsBack = PRESET_YEARS[preset]
  if (yearsBack) {
    let referenceDate = new Date()
    if (anchorDate) {
      referenceDate = new Date(anchorDate)
    } else if (stories[0]?.date) {
      referenceDate = new Date(stories[0].date)
    }
    const cutoffDate = new Date(referenceDate)
    cutoffDate.setFullYear(cutoffDate.getFullYear() - yearsBack)
    minDate = cutoffDate.toISOString().slice(0, 10)
  }

  return stories.filter((story) => {
    const storyDate = story.date || ''
    if (minDate && storyDate && storyDate < minDate) return false
    if (maxDate && storyDate && storyDate > maxDate) return false
    return true
  })
}

/**
 * Canonical URL slug mappings for national library sector organisations and abbreviations.
 * @type {Readonly<Record<string, string>>}
 */
export const ORG_SLUG_MAP = {
  DCMS: 'dcms',
  'Department for Culture, Media and Sport': 'dcms',
  'Arts Council England': 'arts-council-england',
  ACE: 'arts-council-england',
  CILIP: 'cilip',
  'Chartered Institute of Library and Information Professionals': 'cilip',
  'Libraries Connected': 'libraries-connected',
  'Society of Chief Librarians': 'libraries-connected',
  'The Reading Agency': 'the-reading-agency',
  UNISON: 'unison',
  'British Library': 'british-library',
  'The British Library': 'british-library',
  'The Library Campaign': 'the-library-campaign',
  'Welsh Government': 'welsh-government',
  'Scottish Library and Information Council': 'slic',
  SLIC: 'slic',
  LGA: 'lga',
  'Local Government Association': 'lga'
}

/**
 * Resolve a URL-safe slug for a sector stakeholder organisation name or acronym.
 *
 * @param {string} organisationName - Organisation name or acronym.
 * @returns {string} Canonical organisation slug.
 */
export function getOrgSlug(organisationName) {
  if (!organisationName) return ''
  return (
    ORG_SLUG_MAP[organisationName] ||
    String(organisationName)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
  )
}

/**
 * Join a site-relative path with the configured Astro base URL prefix.
 * Leaves external URLs untouched.
 *
 * @param {string} pathname - Internal path or external URL.
 * @param {string} [baseUrl='/'] - Site base URL prefix.
 * @returns {string} Resolved URL path.
 */
export function joinBaseUrl(pathname, baseUrl = '/') {
  if (!pathname) return pathname
  if (/^[a-z]+:/i.test(pathname) || pathname.startsWith('//')) return pathname
  const cleanBase = !baseUrl || baseUrl === '/' ? '' : baseUrl.replace(/\/+$/, '')
  const cleanPath = pathname.startsWith('/') ? pathname : `/${pathname}`
  return `${cleanBase}${cleanPath}`
}

/**
 * Build the internal directory URL for a local authority page from its slug.
 *
 * @param {string} authoritySlug - Authority URL slug.
 * @param {string} [baseUrl='/'] - Site base URL prefix.
 * @returns {string|null} Resolved authority page path, or null if no slug is provided.
 */
export function authorityPageUrl(authoritySlug, baseUrl = '/') {
  if (!authoritySlug) return null
  return joinBaseUrl(`/libraries/${authoritySlug}/`, baseUrl)
}

/**
 * Build the internal stakeholder profile URL for a sector organisation by name or slug.
 *
 * @param {string} nameOrSlug - Organisation display name, acronym, or slug.
 * @param {string} [baseUrl='/'] - Site base URL prefix.
 * @returns {string|null} Resolved organisation profile URL, or null if empty.
 */
export function organisationPageUrl(nameOrSlug, baseUrl = '/') {
  if (!nameOrSlug) return null
  const slug = ORG_SLUG_MAP[nameOrSlug] || getOrgSlug(nameOrSlug)
  return slug ? joinBaseUrl(`/organisations/${slug}/`, baseUrl) : null
}

/**
 * Build a deep-link URL to the `/news/` explorer pre-populated with query filter parameters.
 *
 * @param {object} [filters={}] - Filter key/value pairs (authority, organisation, category, etc.).
 * @param {string} [baseUrl='/'] - Site base URL prefix.
 * @returns {string} Resolved news explorer URL.
 */
export function newsExplorerUrl(filters = {}, baseUrl = '/') {
  const params = new URLSearchParams()
  if (filters.authority) params.set('authority', filters.authority)
  if (filters.organisation) params.set('organisation', filters.organisation)
  if (filters.category) params.set('category', filters.category)
  if (filters.change_type) params.set('change_type', filters.change_type)
  if (filters.q) params.set('q', filters.q)
  if (filters.range) params.set('range', filters.range)
  if (filters.all) params.set('all', 'true')
  const queryString = params.toString()
  return joinBaseUrl(queryString ? `/news/?${queryString}` : '/news/', baseUrl)
}

/**
 * Check whether a news story matches a free-text search query across its headline entity,
 * summary text, authority name, or mentioned library branch names.
 *
 * @param {object} story - News story record.
 * @param {string} query - User search query string.
 * @returns {boolean} True when the story matches the search query.
 */
export function matchesStoryQuery(story, query) {
  const normalizedQuery = String(query || '')
    .trim()
    .toLowerCase()
  if (!normalizedQuery) return true
  if ((story.text || '').toLowerCase().includes(normalizedQuery)) return true
  if ((story.entity || '').toLowerCase().includes(normalizedQuery)) return true
  if ((story.authority_name || '').toLowerCase().includes(normalizedQuery)) return true
  if (
    (story.library_names || []).some((libraryName) =>
      String(libraryName).toLowerCase().includes(normalizedQuery)
    )
  ) {
    return true
  }
  if (
    (story.libraries || []).some((library) =>
      String(library?.name || '')
        .toLowerCase()
        .includes(normalizedQuery)
    )
  ) {
    return true
  }
  return false
}

/**
 * Aggregate mapped news stories or pre-grouped location entries into a GeoJSON FeatureCollection
 * for rendering on the interactive MapLibre news map.
 *
 * @param {Array<object>} items - Array of news story records or location summary objects.
 * @returns {{ type: 'FeatureCollection', features: Array<object> }} GeoJSON FeatureCollection.
 */
export function storiesToLocationGeoJson(items = []) {
  const locationMap = new Map()
  for (const story of items) {
    if (story.recent_stories && Array.isArray(story.recent_stories)) {
      const latitude = Math.round(Number(story.lat) * 1e4) / 1e4
      const longitude = Math.round(Number(story.lng) * 1e4) / 1e4
      const coordinateKey = `${latitude},${longitude}`
      locationMap.set(coordinateKey, {
        id: story.id || coordinateKey,
        name: story.name || story.authority_name || 'News location',
        authority_name: story.authority_name || '',
        country: story.country || '',
        lat: latitude,
        lng: longitude,
        story_count: story.story_count || story.recent_stories.length,
        stories: story.recent_stories
      })
      continue
    }

    const hasValidCoordinates =
      typeof story.lat === 'number' &&
      typeof story.lng === 'number' &&
      !Number.isNaN(story.lat) &&
      !Number.isNaN(story.lng)

    if (hasValidCoordinates) {
      const latitude = Math.round(story.lat * 1e4) / 1e4
      const longitude = Math.round(story.lng * 1e4) / 1e4
      const coordinateKey = `${latitude},${longitude}`
      if (!locationMap.has(coordinateKey)) {
        locationMap.set(coordinateKey, {
          id: story.authority_name || story.entity || coordinateKey,
          name: story.authority_name || story.entity || 'News location',
          authority_name: story.authority_name || '',
          country: story.country || '',
          lat: latitude,
          lng: longitude,
          story_count: 0,
          stories: []
        })
      }
      const locationEntry = locationMap.get(coordinateKey)
      locationEntry.story_count += 1
      if (locationEntry.stories.length < 15) {
        const rawText = story.text || ''
        const truncatedText = rawText.length > 180 ? `${rawText.slice(0, 177)}...` : rawText
        locationEntry.stories.push({
          id: story.id,
          date: story.date || '',
          entity: story.entity || story.authority_name || 'News update',
          text: truncatedText,
          url: story.url || '',
          domain: story.domain || '',
          category: (story.categories && story.categories[0]) || '',
          change: story.change_type || ''
        })
      }
    }
  }

  const features = []
  for (const locationEntry of locationMap.values()) {
    features.push({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [locationEntry.lng, locationEntry.lat]
      },
      properties: {
        id: locationEntry.id,
        name: locationEntry.name,
        authority_name: locationEntry.authority_name,
        country: locationEntry.country,
        story_count: locationEntry.story_count,
        stories: JSON.stringify(locationEntry.stories)
      }
    })
  }
  return {
    type: 'FeatureCollection',
    features
  }
}
