/**
 * @fileoverview Main directory dataset loader reading local authority and library JSON records directly from disk at build time.
 */

import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { createDirectory, directoryBreadcrumbs } from './directoryHelpers.mjs'
import { Library } from './models/Library.mjs'
import { LibraryService } from './models/LibraryService.mjs'
import {
  libraryAddress,
  facilityLabel,
  operatingModelLabel,
  collectValues
} from './dataHelpers.mjs'
import { mapLinks, nearbyLibraries, distanceMiles } from './geoHelpers.mjs'
import { compactOpeningHours } from './openingHoursHelpers.mjs'

/**
 * Read editable records from the content directory without forcing Vite to transform 4,000+ individual modules.
 *
 * @param {'libraries'|'authorities'} folder - Directory collection to read.
 * @returns {object[]} Parsed canonical JSON records in filename order.
 */
function localRecords(folder) {
  const localDir = new URL(`../../content/${folder}/`, import.meta.url)
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
  compactOpeningHours,
  directoryBreadcrumbs,
  createDirectory
}
