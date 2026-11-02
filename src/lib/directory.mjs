/** @file Read community-maintained CMS directory files, not immutable source snapshots. */
import { readdirSync, readFileSync } from 'node:fs';
import { createDirectory } from './directory-model.mjs';

/** Node's test runner does not transform Vite globs; read the same JSON files there. */
function localRecords(folder) {
  const directory = new URL(`../content/${folder}/`, import.meta.url);
  return readdirSync(directory)
    .filter((file) => file.endsWith('.json'))
    .map((file) => JSON.parse(readFileSync(new URL(file, directory), 'utf8')));
}

const authorityRecords = import.meta.env?.SSR
  ? Object.values(
      import.meta.glob('../content/authorities/*.json', { eager: true, import: 'default' })
    )
  : localRecords('authorities');
const libraryRecords = import.meta.env?.SSR
  ? Object.values(
      import.meta.glob('../content/libraries/*.json', { eager: true, import: 'default' })
    )
  : localRecords('libraries');

export const { libraries, authorities, authorityByLibrary, libraryPath, searchRecords } =
  createDirectory(authorityRecords, libraryRecords);
export {
  libraryAddress,
  facilityLabel,
  operatingModelLabel,
  mapLinks,
  collectValues,
  nearbyLibraries,
  distanceMiles,
  compactOpeningHours
} from './directory-model.mjs';
