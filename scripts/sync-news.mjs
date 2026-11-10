/**
 * @fileoverview Ingests, normalizes, and pre-indexes Public Libraries News stories
 * from the public-libraries-news archive into optimized lookups for LibraryCommons.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const targetDir = path.join(rootDir, 'src', 'data', 'news')

// Standard organisation slug mapping
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

function getOrgSlug(name) {
  if (!name) return ''
  return (
    ORG_SLUG_MAP[name] ||
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
  )
}

export function resolvePLNArchiveDir() {
  const candidates = [
    process.env.PLN_DATA_DIR ? path.resolve(process.env.PLN_DATA_DIR) : null,
    path.resolve(rootDir, '..', 'public-libraries-news', 'data', 'stories'),
    path.resolve(rootDir, 'public-libraries-news', 'data', 'stories')
  ].filter(Boolean)

  return candidates.find((dir) => existsSync(dir)) || null
}

async function loadStories() {
  const localArchiveDir = resolvePLNArchiveDir()
  let stories = []

  if (localArchiveDir) {
    console.log(`Loading stories from local archive: ${localArchiveDir}`)
    const files = readdirSync(localArchiveDir)
      .filter((file) => file.endsWith('.json'))
      .sort()

    for (const file of files) {
      const filePath = path.join(localArchiveDir, file)
      try {
        const raw = JSON.parse(readFileSync(filePath, 'utf8'))
        if (Array.isArray(raw)) {
          stories.push(...raw)
        }
      } catch (err) {
        console.warn(`Error reading ${file}:`, err.message)
      }
    }
  } else {
    console.log('Local PLN archive not found. Fetching stories from GitHub...')
    const currentYear = new Date().getFullYear()
    for (let year = currentYear; year >= 2010; year--) {
      const url = `https://raw.githubusercontent.com/LibrariesHacked/public-libraries-news/main/data/stories/${year}.json`
      try {
        const res = await fetch(url)
        if (res.ok) {
          const data = await res.json()
          if (Array.isArray(data)) stories.push(...data)
        }
      } catch (err) {
        console.warn(`Failed fetching ${url}:`, err.message)
      }
    }
  }

  return stories
}

export async function syncNews() {
  mkdirSync(targetDir, { recursive: true })
  const stories = await loadStories()
  console.log(`Processing ${stories.length.toLocaleString()} total stories...`)
  if (!stories.length) {
    throw new Error('No stories found to process; aborting sync to prevent data loss.')
  }

  // Pre-grouped lookups
  const byAuthority = {}
  const byLibrary = {}
  const byOrganisation = {}
  const primaryStories = []
  const archive2020_2022 = []
  const archive2015_2019 = []
  const archive2010_2014 = []
  const locationMap = new Map()

  // Metadata aggregations
  const categoryCounts = {}
  const changeTypeCounts = {}
  const countryCounts = {}
  const orgCounts = {}
  const authorityCounts = {}
  const authorityGssByName = {}
  const libraryCounts = {}

  // Sort stories newest first
  stories.sort((a, b) => (b.post_date || '').localeCompare(a.post_date || ''))

  // High-level summary aggregations
  const orgSummaries = {}
  const authSummaries = {}
  const libSummaries = {}

  // Date cutoffs relative to anchor date (newest story date)
  const anchorDateStr = stories[0]?.post_date || new Date().toISOString().slice(0, 10)
  const anchorDate = new Date(anchorDateStr)

  const d1 = new Date(anchorDate)
  d1.setFullYear(d1.getFullYear() - 1)
  const cutoff1y = d1.toISOString().slice(0, 10)

  const d3 = new Date(anchorDate)
  d3.setFullYear(d3.getFullYear() - 3)
  const cutoff3y = d3.toISOString().slice(0, 10)

  const d5 = new Date(anchorDate)
  d5.setFullYear(d5.getFullYear() - 5)
  const cutoff5y = d5.toISOString().slice(0, 10)

  function updateSummary(map, key, storyDate, year, categories, changeType) {
    if (!key) return
    if (!map[key]) {
      map[key] = {
        total: 0,
        first_year: year || null,
        latest_year: year || null,
        by_preset: { '1y': 0, '3y': 0, '5y': 0, all: 0 },
        by_era: { '2023_present': 0, '2020_2022': 0, '2015_2019': 0, '2010_2014': 0 },
        _cats: {},
        _changes: {}
      }
    }
    const s = map[key]
    s.total += 1
    s.by_preset.all += 1
    if (year) {
      if (!s.first_year || year < s.first_year) s.first_year = year
      if (!s.latest_year || year > s.latest_year) s.latest_year = year
    }
    if (storyDate) {
      if (storyDate >= cutoff1y) s.by_preset['1y'] += 1
      if (storyDate >= cutoff3y) s.by_preset['3y'] += 1
      if (storyDate >= cutoff5y) s.by_preset['5y'] += 1
    }
    if (year >= 2023) s.by_era['2023_present'] += 1
    else if (year >= 2020) s.by_era['2020_2022'] += 1
    else if (year >= 2015) s.by_era['2015_2019'] += 1
    else s.by_era['2010_2014'] += 1

    for (const cat of categories) {
      s._cats[cat] = (s._cats[cat] || 0) + 1
    }
    if (changeType) {
      s._changes[changeType] = (s._changes[changeType] || 0) + 1
    }
  }

  for (const s of stories) {
    const res = s.resolution || {}
    const cls = s.classification || {}

    const authName = res.library_service?.name || null
    const gssCode = res.library_service?.gss_code || null
    const country = res.country || null
    const categories = cls.categories || []
    const changeType = cls.change_type || null
    const sectorBodies = cls.sector_bodies_mentioned || []
    const libs = res.libraries_mentioned || []
    const coords = res.coordinates || null
    const firstLink = s.links && s.links.length > 0 ? s.links[0] : null

    const cleanText = (s.text || s.text_html || '').replace(/<[^>]+>/g, '').trim()

    // Compact story item for page displays and card rendering
    const item = {
      id: s.id,
      date: s.post_date || '',
      entity: s.entity_raw || '',
      text: cleanText,
      url: firstLink?.url || null,
      domain: firstLink?.domain || null,
      categories,
      change_type: changeType,
      organisations: sectorBodies,
      authority_name: authName,
      country
    }

    const year = parseInt((s.post_date || '').slice(0, 4), 10)

    // 1. By Authority (capped to 20 most recent per authority)
    const authKey = gssCode || (authName ? authName.toLowerCase() : null)
    if (authKey) {
      if (gssCode) {
        updateSummary(authSummaries, gssCode, s.post_date, year, categories, changeType)
        if (authName) authSummaries[gssCode].name = authName
      }
      if (authName) {
        const lowerName = authName.toLowerCase()
        if (lowerName !== gssCode) {
          updateSummary(authSummaries, lowerName, s.post_date, year, categories, changeType)
          authSummaries[lowerName].name = authName
          if (gssCode) authSummaries[lowerName].gss_code = gssCode
        }
      }
      if (!byAuthority[authKey]) byAuthority[authKey] = []
      byAuthority[authKey].push(item)
      if (authName) {
        authorityCounts[authName] = (authorityCounts[authName] || 0) + 1
        if (gssCode) {
          authorityGssByName[authName.toLowerCase()] = gssCode
        }
      }
    }

    // 2. By Library ID
    for (const lib of libs) {
      if (lib.id) {
        updateSummary(libSummaries, lib.id, s.post_date, year, categories, changeType)
        if (lib.name) {
          libSummaries[lib.id].name = lib.name
        }
        if (!byLibrary[lib.id]) byLibrary[lib.id] = []
        byLibrary[lib.id].push(item)
        libraryCounts[lib.id] = (libraryCounts[lib.id] || 0) + 1
      }
    }

    // 3. By Organisation
    for (const body of sectorBodies) {
      const slug = getOrgSlug(body)
      if (slug) {
        updateSummary(orgSummaries, slug, s.post_date, year, categories, changeType)
        orgSummaries[slug].name = body
        if (!byOrganisation[slug]) byOrganisation[slug] = []
        byOrganisation[slug].push(item)
        orgCounts[body] = (orgCounts[body] || 0) + 1
      }
    }

    // 4. Counts
    for (const cat of categories) {
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1
    }
    if (changeType) {
      changeTypeCounts[changeType] = (changeTypeCounts[changeType] || 0) + 1
    }
    if (country) {
      countryCounts[country] = (countryCounts[country] || 0) + 1
    }

    // 5. Unique Location Aggregation for Maps
    if (
      coords?.latitude != null &&
      coords?.longitude != null &&
      !isNaN(coords.latitude) &&
      !isNaN(coords.longitude)
    ) {
      const lat4 = Math.round(coords.latitude * 1e4) / 1e4
      const lng4 = Math.round(coords.longitude * 1e4) / 1e4
      const locKey = `${lat4},${lng4}`

      if (!locationMap.has(locKey)) {
        locationMap.set(locKey, {
          id: authKey || locKey,
          name: authName || s.entity_raw || 'Library news location',
          authority_name: authName || '',
          country: country || '',
          lat: lat4,
          lng: lng4,
          story_count: 0,
          recent_stories: []
        })
      }
      const loc = locationMap.get(locKey)
      loc.story_count += 1
      if (loc.recent_stories.length < 10) {
        loc.recent_stories.push({
          id: s.id,
          date: s.post_date || '',
          entity: s.entity_raw || '',
          text: cleanText,
          url: firstLink?.url || null,
          domain: firstLink?.domain || null,
          category: categories[0] || '',
          change: changeType || ''
        })
      }
    }

    // 6. Client Index Partitioning (Primary recent + archive extensions)
    const browserItem = {
      id: s.id,
      date: s.post_date || '',
      entity: s.entity_raw || '',
      text: cleanText,
      url: firstLink?.url || null,
      domain: firstLink?.domain || null,
      categories,
      change_type: changeType,
      organisations: sectorBodies,
      authority_name: authName,
      country,
      lat: coords?.latitude != null ? Math.round(coords.latitude * 1e4) / 1e4 : null,
      lng: coords?.longitude != null ? Math.round(coords.longitude * 1e4) / 1e4 : null
    }

    if (year >= 2023) {
      primaryStories.push(browserItem)
    } else if (year >= 2020) {
      archive2020_2022.push(browserItem)
    } else if (year >= 2015) {
      archive2015_2019.push(browserItem)
    } else {
      archive2010_2014.push(browserItem)
    }
  }

  const newsLocations = Array.from(locationMap.values())

  // Save lookups
  console.log(
    `Writing stories-by-authority.json (${Object.keys(byAuthority).length} authorities)...`
  )
  writeFileSync(
    path.join(targetDir, 'stories-by-authority.json'),
    JSON.stringify(byAuthority),
    'utf8'
  )

  console.log(`Writing stories-by-library.json (${Object.keys(byLibrary).length} libraries)...`)
  writeFileSync(path.join(targetDir, 'stories-by-library.json'), JSON.stringify(byLibrary), 'utf8')

  console.log(
    `Writing stories-by-organisation.json (${Object.keys(byOrganisation).length} orgs)...`
  )
  writeFileSync(
    path.join(targetDir, 'stories-by-organisation.json'),
    JSON.stringify(byOrganisation),
    'utf8'
  )

  console.log(`Writing news-locations.json (${newsLocations.length} unique map locations)...`)
  writeFileSync(path.join(targetDir, 'news-locations.json'), JSON.stringify(newsLocations), 'utf8')

  console.log(
    `Writing news-index.json (${primaryStories.length.toLocaleString()} recent 2023–2026 stories)...`
  )
  writeFileSync(path.join(targetDir, 'news-index.json'), JSON.stringify(primaryStories), 'utf8')

  console.log(
    `Writing archive-2020-2022.json (${archive2020_2022.length.toLocaleString()} stories)...`
  )
  writeFileSync(
    path.join(targetDir, 'archive-2020-2022.json'),
    JSON.stringify(archive2020_2022),
    'utf8'
  )

  console.log(
    `Writing archive-2015-2019.json (${archive2015_2019.length.toLocaleString()} stories)...`
  )
  writeFileSync(
    path.join(targetDir, 'archive-2015-2019.json'),
    JSON.stringify(archive2015_2019),
    'utf8'
  )

  console.log(
    `Writing archive-2010-2014.json (${archive2010_2014.length.toLocaleString()} stories)...`
  )
  writeFileSync(
    path.join(targetDir, 'archive-2010-2014.json'),
    JSON.stringify(archive2010_2014),
    'utf8'
  )

  function finalizeSummaries(map) {
    for (const key of Object.keys(map)) {
      const s = map[key]
      s.top_categories = Object.entries(s._cats || {})
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(([k, count]) => ({ key: k, count }))
      delete s._cats
      s.top_change_types = Object.entries(s._changes || {})
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([k, count]) => ({ key: k, count }))
      delete s._changes
    }
  }

  finalizeSummaries(orgSummaries)
  finalizeSummaries(authSummaries)
  finalizeSummaries(libSummaries)

  const newsSummaries = {
    organisations: orgSummaries,
    authorities: authSummaries,
    libraries: libSummaries
  }

  console.log(
    `Writing news-summaries.json (${Object.keys(orgSummaries).length} orgs, ${Object.keys(authSummaries).length} auths, ${Object.keys(libSummaries).length} libs)...`
  )
  writeFileSync(path.join(targetDir, 'news-summaries.json'), JSON.stringify(newsSummaries), 'utf8')

  const metadata = {
    total_stories: stories.length,
    indexed_stories: primaryStories.length,
    total_locations: newsLocations.length,
    updated_on: new Date().toISOString(),
    archive_extensions: [
      {
        id: '2020-2022',
        label: '2020–2022',
        count: archive2020_2022.length,
        url: '/news/archive/2020-2022.json'
      },
      {
        id: '2015-2019',
        label: '2015–2019',
        count: archive2015_2019.length,
        url: '/news/archive/2015-2019.json'
      },
      {
        id: '2010-2014',
        label: '2010–2014',
        count: archive2010_2014.length,
        url: '/news/archive/2010-2014.json'
      }
    ],
    categories: categoryCounts,
    change_types: changeTypeCounts,
    countries: countryCounts,
    organisations: orgCounts,
    authorities: authorityCounts,
    libraries: libraryCounts,
    authority_gss_by_name: authorityGssByName
  }

  console.log('Writing news-metadata.json...')
  writeFileSync(
    path.join(targetDir, 'news-metadata.json'),
    JSON.stringify(metadata, null, 2),
    'utf8'
  )

  console.log('News sync complete!')
}

// Run directly if executed as a script
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  syncNews().catch((err) => {
    console.error('Error during news sync:', err)
    process.exit(1)
  })
}
