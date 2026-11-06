/**
 * @fileoverview Read community-maintained CMS directory files and construct breadcrumb trails.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { createDirectory } from './directory-model.mjs'
import { settings } from './site.mjs'

/**
 * Read editable records from content directory without forcing Vite to transform 4,000+ individual modules.
 * @param {'libraries'|'authorities'} folder - Directory collection to read.
 * @returns {object[]} Parsed canonical JSON records in filename order.
 */
function localRecords(folder) {
  const localDir = new URL(`../content/${folder}/`, import.meta.url)
  const directory = existsSync(localDir)
    ? localDir
    : new URL(`./src/content/${folder}/`, pathToFileURL(`${process.cwd()}/`))
  return readdirSync(directory)
    .filter((file) => file.endsWith('.json'))
    .map((file) => JSON.parse(readFileSync(new URL(file, directory), 'utf8')))
}

const authorityRecords = localRecords('authorities')
const libraryRecords = localRecords('libraries')

export const { libraries, authorities, authorityByLibrary, libraryPath, searchRecords } =
  createDirectory(authorityRecords, libraryRecords, { requireCanonical: true })
export {
  Library,
  LibraryService,
  libraryAddress,
  facilityLabel,
  operatingModelLabel,
  mapLinks,
  collectValues,
  nearbyLibraries,
  distanceMiles,
  compactOpeningHours
} from './directory-model.mjs'

/**
 * Build a breadcrumb navigation trail for directory pages.
 * @param {string} title - Page title for the current terminal breadcrumb.
 * @param {{name: string, slug: string}|null} [authority=null] - Optional parent authority.
 * @returns {Array<{label: string, href?: string, current?: boolean}>} Breadcrumb items.
 */
export function directoryBreadcrumbs(title, authority = null) {
  return [
    { label: settings.ui.editorial.home_breadcrumb, href: '/' },
    { label: settings.ui.directory.breadcrumb, href: '/libraries/' },
    ...(authority ? [{ label: authority.name, href: `/libraries/${authority.slug}/` }] : []),
    { label: title, current: true }
  ]
}
