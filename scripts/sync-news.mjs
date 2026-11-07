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
  'DCMS': 'dcms',
  'Department for Culture, Media and Sport': 'dcms',
  'Arts Council England': 'arts-council-england',
  'ACE': 'arts-council-england',
  'CILIP': 'cilip',
  'Chartered Institute of Library and Information Professionals': 'cilip',
  'Libraries Connected': 'libraries-connected',
  'Society of Chief Librarians': 'libraries-connected',
  'The Reading Agency': 'the-reading-agency',
  'UNISON': 'unison',
  'British Library': 'british-library',
  'The British Library': 'british-library',
  'The Library Campaign': 'the-library-campaign',
  'Welsh Government': 'welsh-government',
  'Scottish Library and Information Council': 'slic',
  'SLIC': 'slic'
}

function getOrgSlug(name) {
  if (!name) return ''
  return ORG_SLUG_MAP[name] || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

async function loadStories() {
  const localArchiveDir = path.resolve(rootDir, '..', 'public-libraries-news', 'data', 'stories')
  let stories = []

  if (existsSync(localArchiveDir)) {
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
    console.log('Local PLN archive not found. Fetching recent stories from GitHub...')
    const currentYear = new Date().getFullYear()
    for (const year of [currentYear, currentYear - 1, currentYear - 2]) {
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

  // Pre-grouped lookups
  const byAuthority = {}
  const byLibrary = {}
  const byOrganisation = {}
  const mapStories = []

  // Metadata aggregations
  const categoryCounts = {}
  const changeTypeCounts = {}
  const countryCounts = {}
  const orgCounts = {}
  const authorityCounts = {}
  const authorityGssByName = {}

  // Sort stories newest first
  stories.sort((a, b) => (b.post_date || '').localeCompare(a.post_date || ''))

  for (const s of stories) {
    const res = s.resolution || {}
    const cls = s.classification || {}

    const authName = res.library_service?.name || null
    const gssCode = res.library_service?.gss_code || null
    const country = res.country || null
    const categories = cls.categories || []
    const changeType = cls.change_type || null
    const sectorBodies = cls.sector_bodies_mentioned || []
    const financial = cls.financial_mentions || []
    const libs = res.libraries_mentioned || []
    const coords = res.coordinates || null

    // Clean story item for web display
    const item = {
      id: s.id,
      date: s.post_date || '',
      section: s.section || '',
      entity: s.entity_raw || '',
      text_html: s.text_html || s.text || '',
      links: (s.links || []).map((l) => ({ url: l.url, domain: l.domain, title: l.title })),
      categories,
      primary_category: cls.primary_category || null,
      change_type: changeType,
      organisations: sectorBodies,
      financial,
      authority_name: authName,
      gss_code: gssCode,
      country,
      library_names: libs.map((l) => l.name),
      library_ids: libs.map((l) => l.id),
      lat: coords?.latitude || null,
      lng: coords?.longitude || null
    }

    // 1. By Authority (index by GSS code if present, else normalized authority name)
    const authKey = gssCode || (authName ? authName.toLowerCase() : null)
    if (authKey) {
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
        if (!byLibrary[lib.id]) byLibrary[lib.id] = []
        byLibrary[lib.id].push(item)
      }
    }

    // 3. By Organisation
    for (const body of sectorBodies) {
      const slug = getOrgSlug(body)
      if (slug) {
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

    // 5. Client Index for /news/ map & filter (compact payload for browser)
    const year = parseInt((s.post_date || '').slice(0, 4), 10)
    if (year >= 2020 || libs.length > 0) {
      // First link if present
      const firstLink = s.links && s.links.length > 0 ? s.links[0] : null
      mapStories.push({
        id: s.id,
        date: s.post_date || '',
        entity: s.entity_raw || '',
        text: (s.text || '').length > 250 ? `${(s.text || '').slice(0, 247)}...` : (s.text || ''),
        url: firstLink?.url || null,
        domain: firstLink?.domain || null,
        categories,
        change_type: changeType,
        organisations: sectorBodies,
        authority_name: authName,
        country,
        library_names: libs.map((l) => l.name),
        lat: coords?.latitude || null,
        lng: coords?.longitude || null
      })
    }
  }

  // Save lookups
  console.log(`Writing stories-by-authority.json (${Object.keys(byAuthority).length} authorities)...`)
  writeFileSync(
    path.join(targetDir, 'stories-by-authority.json'),
    JSON.stringify(byAuthority),
    'utf8'
  )

  console.log(`Writing stories-by-library.json (${Object.keys(byLibrary).length} libraries)...`)
  writeFileSync(
    path.join(targetDir, 'stories-by-library.json'),
    JSON.stringify(byLibrary),
    'utf8'
  )

  console.log(`Writing stories-by-organisation.json (${Object.keys(byOrganisation).length} orgs)...`)
  writeFileSync(
    path.join(targetDir, 'stories-by-organisation.json'),
    JSON.stringify(byOrganisation),
    'utf8'
  )

  console.log(`Writing news-index.json (${mapStories.length.toLocaleString()} browser stories)...`)
  writeFileSync(
    path.join(targetDir, 'news-index.json'),
    JSON.stringify(mapStories),
    'utf8'
  )

  const metadata = {
    total_stories: stories.length,
    indexed_stories: mapStories.length,
    updated_on: new Date().toISOString(),
    categories: categoryCounts,
    change_types: changeTypeCounts,
    countries: countryCounts,
    organisations: orgCounts,
    authorities: authorityCounts,
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
