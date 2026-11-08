/**
 * @fileoverview Directory migration pipeline transforming legacy snapshots into canonical CMS collections.
 */

import {
  readFileSync,
  writeFileSync,
  readdirSync,
  mkdirSync,
  existsSync,
  unlinkSync
} from 'node:fs'
import { createHash } from 'node:crypto'
import { gzipSync, gunzipSync } from 'node:zlib'
import { fileURLToPath } from 'node:url'
import { parse } from 'csv-parse/sync'
import readXlsx from 'read-excel-file/node'
import { normalizePostcode, normalizeUprn } from '../../src/lib/helpers/dataHelpers.mjs'
import { days, openingHours } from '../../src/lib/helpers/openingHoursHelpers.mjs'
import {
  directorySchemas,
  dataIssues,
  validateRecords
} from '../../src/lib/helpers/schemaHelpers.mjs'
import { distanceMiles } from '../../src/lib/helpers/geoHelpers.mjs'

export const root = new URL('../../', import.meta.url)
export const auditRoot = new URL('migration/directory/', root)
/** @param {unknown} value - Source text. @returns {string|null} Trimmed text without non-breaking spaces. */
const text = (value) =>
  value === null || value === undefined
    ? null
    : String(value)
        .replace(/\u00a0/g, ' ')
        .trim() || null
/** @param {unknown} value - Matching evidence. @returns {string} Accent-insensitive ASCII key, never a replacement display value. */
export const normalized = (value) =>
  String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
/** @param {unknown} value - Library name. @returns {string} Comparison key without generic library words. */
const nameKey = (value) =>
  normalized(value)
    .replace(/\b(library|libraries|public|the)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
/** @param {unknown} value - Authority name. @returns {string} Comparison key without generic administrative words. */
const authorityKey = (value) =>
  normalized(value)
    .replace(/\b(council|county|city|of|borough|royal|metropolitan|district|london)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
/** @param {{fields: {name: string}[]}} schema - Field specification. @returns {object} Complete null-valued canonical data object. */
const blank = (schema) => Object.fromEntries(schema.fields.map((field) => [field.name, null]))
/** @param {unknown} value - Historical year text. @returns {number|null} Exact four-digit year, without guessing decades. */
const year = (value) => (/^\d{4}$/.test(String(value ?? '').trim()) ? Number(value) : null)
/** @param {unknown} value - Authority identifier. @returns {string|null} Schema-compatible GSS code, excluding placeholders. */
const gssCode = (value) => (/^[ELMNSW]\d{8}$/.test(String(value ?? '')) ? value : null)
const operation = {
  'Local Authority Run': 'LAL',
  'Local Authority Run Unstaffed': 'LAL-',
  Commissioned: 'CL',
  'Community Run': 'CRL',
  'Independent Community': 'ICL',
  LA: 'LAL',
  LAU: 'LAL-',
  C: 'CL',
  CR: 'CRL',
  ICL: 'ICL'
}

export const niSlugs = new Set([
  'county-antrim',
  'county-armagh',
  'county-down',
  'county-fermanagh',
  'county-londonderry',
  'county-tyrone',
  'derry-city',
  'greater-belfast'
])

export const niAuthority = {
  id: 'northern-ireland',
  slug: 'northern-ireland',
  source_id: 'ni',
  source_url: 'https://www.librariesni.org.uk/',
  updated_on: '2026-01-23',
  reviewed_on: '',
  imported_on: '2026-10-27',
  name: 'Northern Ireland',
  gss: 'N92000002',
  country: 'Northern Ireland',
  website: 'https://www.librariesni.org.uk/',
  librariesUrl: 'https://www.librariesni.org.uk/libraries/',
  catalogue: 'https://catalogue.librariesni.org.uk/',
  joinOnline: 'https://www.librariesni.org.uk/becoming-a-member/',
  eventsUrl: 'https://www.librariesni.org.uk/events/',
  email: 'enquiries@librariesni.org.uk',
  phone: '0345 450 4580',
  operatingOrganisation: 'Libraries NI',
  notes:
    'All public libraries across Northern Ireland are operated centrally by Libraries NI under the Libraries Act (Northern Ireland) 2008.'
}
/** @param {URL|string} file - UTF-8 JSON file. @returns {object} Parsed source or audit document. */
const json = (file) => JSON.parse(readFileSync(file, 'utf8'))
/** @param {URL|string} file - Output path. @param {unknown} value - Serializable audit data. @returns {void} */
export function writeJson(file, value) {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`)
}

/**
 * Preflight every output before writing, preserving originals and subsequent edits.
 * Only unchanged migration-created files may be removed by a later replay.
 * @param {object} original - Baseline collections with filenames and original records.
 * @param {[string, {file: string, record: object}[]][]} groups - Planned output collections.
 * @param {{workspaceRoot?: URL, reportRoot?: URL}} [options] - Repository or fixture roots.
 * @returns {void} Writes records and their replay-protection manifest.
 * @throws {Error} Before writing if a record was edited or an original would be lost.
 */
export function writeMigratedRecords(
  original,
  groups,
  { workspaceRoot = root, reportRoot = auditRoot } = {}
) {
  const manifestFile = new URL('written-files.json', reportRoot)
  const previous = existsSync(manifestFile) ? json(manifestFile) : {}
  const planned = new Map()
  for (const [folder, records] of groups) {
    for (const { file, record } of records) {
      const path = `src/content/${folder}/${file}`
      if (planned.has(path)) throw new Error(`Duplicate output file: ${path}`)
      planned.set(path, `${JSON.stringify(record, null, 2)}\n`)
      const url = new URL(path, workspaceRoot)
      if (!existsSync(url)) continue
      const current = readFileSync(url)
      const digest = createHash('sha256').update(current).digest('hex')
      const baselineRecord = original[folder]?.find((item) => item.file === file)?.record
      if (
        previous[path]
          ? previous[path] !== digest
          : !baselineRecord || JSON.stringify(json(url)) !== JSON.stringify(baselineRecord)
      ) {
        throw new Error(
          `Refusing to overwrite edited record: ${path}; reconcile it through reviewed overrides`
        )
      }
    }
  }
  for (const [folder, records] of Object.entries(original)) {
    for (const { file, record } of records) {
      if (folder === 'authorities' && niSlugs.has(record.slug)) continue
      if (
        folder === 'libraries' &&
        (niSlugs.has(record.authority) ||
          record.slug.includes('larne') ||
          record.postcode?.startsWith('BT'))
      )
        continue
      if (!planned.has(`src/content/${folder}/${file}`))
        throw new Error(`Migration would remove original record: ${folder}/${file}`)
    }
  }
  const removed = Object.keys(previous).filter((path) => !planned.has(path))
  for (const path of removed) {
    const url = new URL(path, workspaceRoot)
    if (
      existsSync(url) &&
      createHash('sha256').update(readFileSync(url)).digest('hex') !== previous[path]
    )
      throw new Error(`Refusing to remove edited migration record: ${path}`)
  }
  const manifest = {}
  for (const [path, content] of planned) {
    writeFileSync(new URL(path, workspaceRoot), content)
    manifest[path] = createHash('sha256').update(content).digest('hex')
  }
  for (const path of removed)
    if (existsSync(new URL(path, workspaceRoot))) unlinkSync(new URL(path, workspaceRoot))
  writeJson(manifestFile, manifest)
}

/**
 * Extract literal postcode corrections without executing any historical SQL.
 * @param {string} sql - Original script, including ignored destructive statements.
 * @returns {object[]} Scoped corrections retaining physical source line numbers.
 */
export function sqlPostcodeRules(sql) {
  return sql.split('\n').flatMap((line, index) => {
    const match = line.match(
      /^update basic set postcode = '((?:''|[^'])*)' where (?:name = '((?:''|[^'])*)' and )?postcode = '((?:''|[^'])*)';/i
    )
    if (!match) return []
    return [
      {
        line: index + 1,
        to: match[1].replace(/''/g, "'"),
        name: match[2]?.replace(/''/g, "'"),
        from: match[3].replace(/''/g, "'")
      }
    ]
  })
}

/**
 * Apply the first name-compatible historical correction as matching evidence only.
 * @param {unknown} value - Original postcode text.
 * @param {string} name - Library name used to scope corrections.
 * @param {object[]} rules - Extracted SQL correction rules.
 * @returns {{postcode: string|null, rule: object|undefined}} Candidate and provenance.
 */
export function correctedPostcode(value, name, rules) {
  const rule = rules.find(
    (item) =>
      normalizePostcode(item.from) === normalizePostcode(value) &&
      normalized(item.from) === normalized(value) &&
      (!item.name || nameKey(item.name) === nameKey(name))
  )
  return { postcode: normalizePostcode(rule?.to || value), rule }
}

/** @param {string} value - Address evidence. @param {string|null} postcode - Postcode to omit. @returns {string[]} Comparable tokens with limited street abbreviation normalization. */
function addressWords(value, postcode) {
  return normalized(
    String(value || '').replace(
      new RegExp(String(postcode || '').replace(/\s/g, '\\s*'), 'ig'),
      ' '
    )
  )
    .replace(/\brd\b/g, 'road')
    .replace(/\bst\b/g, 'street')
    .split(' ')
    .filter(
      (word) =>
        word &&
        ![
          'library',
          'libraries',
          'united',
          'kingdom',
          'england',
          'scotland',
          'wales',
          'the'
        ].includes(word)
    )
}

/**
 * Require compatible names, identical postcodes and specific street/building evidence.
 * Matching towns or counties alone cannot establish that two rows share a building.
 * @param {object} first - LibraryOn target with name, address and postcode.
 * @param {object} second - Supporting candidate with the same evidence fields.
 * @returns {boolean} Whether conservative automatic enrichment matching is allowed.
 */
export function buildingMatch(first, second) {
  if (!first.postcode || first.postcode !== second.postcode) return false
  const firstName = nameKey(first.name)
  const secondName = nameKey(second.name)
  if (
    !firstName ||
    !secondName ||
    !(
      firstName === secondName ||
      ` ${firstName} `.includes(` ${secondName} `) ||
      ` ${secondName} `.includes(` ${firstName} `)
    )
  )
    return false
  const words = addressWords(first.address, first.postcode)
  const other = addressWords(second.address, second.postcode)
  /** @param {string[]} tokens - Address words. @returns {string[]} Adjacent street-name/type pairs for conflict detection. */
  const streetNames = (tokens) =>
    tokens.flatMap((word, index) =>
      index > 0 &&
      /^(road|street|drive|lane|avenue|terrace|square|crescent|way|close|place|arcade)$/.test(word)
        ? [`${tokens[index - 1]} ${word}`]
        : []
    )
  const streets = streetNames(words)
  const otherStreets = streetNames(other)
  if (
    streets.length &&
    otherStreets.length &&
    !streets.some((street) => otherStreets.includes(street))
  )
    return false
  const numbers = words.filter((word) => /^\d+[a-z]?$/.test(word))
  const otherNumbers = other.filter((word) => /^\d+[a-z]?$/.test(word))
  if (numbers.length && otherNumbers.length && !numbers.some((word) => otherNumbers.includes(word)))
    return false
  const shared = [...new Set(words.filter((word) => other.includes(word)))]
  const nameWords = new Set(normalized(`${first.name} ${second.name}`).split(' '))
  const firstLines = new Set([
    ...addressWords(String(first.address || '').split(',')[0], first.postcode),
    ...addressWords(String(second.address || '').split(',')[0], second.postcode)
  ])
  return (
    shared.filter((word) => !nameWords.has(word)).length >= 2 &&
    shared.some(
      (word) =>
        firstLines.has(word) &&
        !nameWords.has(word) &&
        !['road', 'street', 'high', 'town', 'centre', 'center', 'county'].includes(word)
    )
  )
}

/**
 * Detect plausible duplicate buildings despite changed names or postcodes.
 * This exclusion rule is intentionally broader than enrichment matching.
 * @param {object} first - Existing authority/building evidence.
 * @param {object} second - Proposed historical building in the same authority.
 * @returns {boolean} Whether a new closed-building record should be withheld.
 */
export function possibleSameBuilding(first, second) {
  if (first.authority !== second.authority) return false
  if (first.uprn && second.uprn && first.uprn === second.uprn) return true
  const firstAddress = normalized(first.address)
  const secondAddress = normalized(second.address)
  if (firstAddress && firstAddress === secondAddress) return true
  /** @param {string} address - Full address. @returns {string|undefined} First specific street segment, including any building number. */
  const streetKey = (address) =>
    String(address || '')
      .split(',')
      .map((part) =>
        normalized(part)
          .replace(/\brd\b/g, 'road')
          .replace(/\bst\b/g, 'street')
      )
      .find((part) =>
        /\b(road|street|drive|lane|avenue|terrace|square|crescent|way|close|place|arcade)\b/.test(
          part
        )
      )
  const firstStreet = streetKey(first.address)
  const secondStreet = streetKey(second.address)
  return Boolean(firstStreet && firstStreet === secondStreet)
}

/**
 * Read supporting CSV/workbook rows with raw values, corrections and source row numbers.
 * @returns {Promise<{sources: object[], grid: object[], rules: object[]}>} Priority-ordered inputs.
 */
export async function readInputs() {
  const rules = sqlPostcodeRules(
    readFileSync(new URL('tempdata/load_england_2023.sql', root), 'utf8')
  )
  const csv = parse(readFileSync(new URL('tempdata/libraries.csv', root)), {
    columns: true,
    bom: true,
    skip_empty_lines: true
  })
  const grid = parse(readFileSync(new URL('tempdata/Services-Grid view.csv', root)), {
    columns: true,
    bom: true,
    skip_empty_lines: true
  })
  const sheets = await readXlsx(
    fileURLToPath(new URL('tempdata/English Public Libraries Location Dataset 2024.xlsx', root))
  )
  const sheet = sheets.find((item) => item.sheet === '2024 Dataset').data
  const arts = sheet
    .slice(1)
    .map((row) => Object.fromEntries(sheet[0].map((heading, index) => [heading, row[index]])))
  const sources = []
  for (const [source, rows] of [
    ['libraries.csv', csv],
    ['arts-council-2024', arts]
  ]) {
    rows.forEach((raw, index) => {
      const name = text(raw['Library name'] || raw.Name)
      const correction = correctedPostcode(raw.Postcode, name, rules)
      const data = blank(directorySchemas.libraries)
      if (source === 'libraries.csv') {
        for (const field of directorySchemas.libraries.fields) {
          if (field.type === 'year') data[field.name] = year(raw[field.name])
          else if (field.name === 'Unique property reference number')
            data[field.name] = normalizeUprn(raw[field.name])
          else data[field.name] = text(raw[field.name])
        }
      } else {
        data['Library name'] = name
        data['Local authority'] = text(raw['Reporting Library Service'])
        for (const key of ['Address 1', 'Address 2', 'Address 3', 'Email address'])
          data[key] = text(raw[key])
        data['Email address'] = text(raw['Public Contact Email'])
        data['Unique property reference number'] = null
        data.Statutory = ['Yes', 'No'].includes(raw['Statutory Provision: 31/12/2024'])
          ? raw['Statutory Provision: 31/12/2024']
          : null
        data['Type of library'] = operation[raw['Facility Operation: 31/12/2024']] || null
        data['Year opened'] = year(raw['Year this facility First Opened at this address, if known'])
        data['Year closed'] = year(raw['Year this facility Permanently Closed, if relevant'])
        data['Facility type'] =
          {
            'static library': 'Static library',
            'static local history library': 'Static local history library',
            archive: 'Archive',
            'mobile library': 'Mobile library',
            'prison library': 'Prison library'
          }[normalized(raw.Type)] || null
      }
      data.Postcode = correction.postcode
      sources.push({
        source,
        row: index + 2,
        name,
        authority: data['Local authority'],
        postcode: data.Postcode,
        address: ['Address 1', 'Address 2', 'Address 3']
          .map((key) => data[key])
          .filter(Boolean)
          .join(', '),
        data,
        raw,
        correction: correction.rule || null
      })
    })
  }
  return { sources, grid, rules }
}

/**
 * Read the immutable snapshot, creating it only from pre-migration legacy records.
 * @returns {object} Original LibraryOn library and service collections.
 * @throws {Error} If migrated content would be mistaken for an original snapshot.
 */
export function baseline() {
  mkdirSync(auditRoot, { recursive: true })
  const file = new URL('libraryon-baseline.json.gz', auditRoot)
  if (existsSync(file)) return JSON.parse(gunzipSync(readFileSync(file)))
  const original = Object.fromEntries(
    ['libraries', 'authorities'].map((folder) => [
      folder,
      readdirSync(new URL(`src/content/${folder}/`, root))
        .filter((name) => name.endsWith('.json'))
        .map((file) => ({ file, record: json(new URL(`src/content/${folder}/${file}`, root)) }))
    ])
  )
  if (original.libraries.some(({ record }) => record.data))
    throw new Error('Cannot snapshot migrated records as the LibraryOn baseline')
  writeFileSync(file, gzipSync(JSON.stringify(original), { mtime: 0 }))
  return original
}

/** @param {object} record - Original routing/provenance metadata. @param {object} data - Canonical schema fields. @returns {object} Live envelope without a legacy payload. */
function envelope(record, data) {
  return {
    ...Object.fromEntries(
      [
        'id',
        'slug',
        'authority',
        'source_id',
        'source_url',
        'updated_on',
        'reviewed_on',
        'imported_on'
      ]
        .filter((key) => record[key] !== undefined)
        .map((key) => [key, record[key]])
    ),
    data,
    validation_exceptions: []
  }
}

/**
 * Convert one LibraryOn building, retaining dates and reporting ambiguous hours.
 * @param {object} record - Preserved legacy library.
 * @param {object|undefined} authority - Resolved LibraryOn service, if known.
 * @param {{review: object[]}} report - Receives conversion problems, not guessed repairs.
 * @returns {object} Canonical library data and stable metadata only.
 */
export function convertLibrary(record, authority, report) {
  const data = blank(directorySchemas.libraries)
  Object.assign(data, {
    'Local authority': authority?.name || null,
    'Local authority code': gssCode(authority?.gss),
    'Library name': record.name,
    'Address 1': text(record.address),
    Postcode: normalizePostcode(record.postcode),
    'Unique property reference number': normalizeUprn(record.uprn),
    Latitude: record.latitude ?? null,
    Longitude: record.longitude ?? null,
    Status:
      record.permanentlyClosed ||
      record.facilityOperated === 'Closed' ||
      record.facilityOperated === 'Facility Not Open'
        ? 'Closed (permanent)'
        : record.facilityOperated === 'Temporary Closure'
          ? 'Closed (temporary)'
          : 'Open',
    'Type of library': operation[record.facilityOperated] || null,
    'Special hours': text(record.openingTimesNotes),
    'Co-located': record.coLocated?.length ? 'Yes' : null,
    'Co-located with': record.coLocated?.join('; ') || null,
    'Facilities and services': record.services?.map((item) => item.service).join('; ') || null,
    'Phone number': text(record.phone),
    'Email address': text(record.email),
    URL: text(record.website),
    Notes: text(record.notes)
  })
  for (const day of days) {
    const entry = record.openingTimes?.[day.toLowerCase()]
    if (!entry) continue
    for (const [type, keep] of [
      ['staffed', (frame) => frame.type !== 'Self-service'],
      ['unstaffed', (frame) => frame.type === 'Self-service']
    ]) {
      const frames = (entry.timeFrames || []).filter(keep)
      if (!frames.length) {
        data[`${day} ${type} hours`] = null
        continue
      }
      try {
        const sorted = [...frames].sort((first, second) =>
          String(first.startTime).localeCompare(String(second.startTime))
        )
        data[`${day} ${type} hours`] = openingHours(
          sorted.map((frame) => `${frame.startTime}-${frame.endTime}`).join(',')
        )
      } catch (error) {
        report.review.push({
          kind: 'opening-hours',
          id: record.id,
          day,
          type,
          original: frames,
          reason: error.message
        })
      }
    }
  }
  const facilities = new Set(record.services?.map((item) => item.service))
  for (const [service, field] of [
    ['Computers', 'Public computers'],
    ['Printing', 'Printing'],
    ['Meeting rooms', 'Meeting rooms'],
    ['Quiet study space', 'Quiet study space']
  ]) {
    if (facilities.has(service)) data[field] = 'Yes'
  }
  for (const [label, field] of [
    ['step-free-access', 'Step-free access'],
    ['accessible-toilet', 'Accessible toilet'],
    ['hearing-loop-system', 'Hearing loop']
  ]) {
    if (record.accessibility?.includes(label)) data[field] = 'Yes'
  }
  return envelope(record, data)
}

/** @param {object} record - Original service. @returns {object} Canonical contacts/social URLs with dates and stable identifiers preserved. */
export function convertAuthority(record) {
  const data = blank(directorySchemas.authorities)
  for (const [old, key] of Object.entries({
    name: 'Local authority',
    gss: 'Local authority code',
    country: 'Country',
    website: 'Service URL',
    librariesUrl: 'Libraries URL',
    phone: 'Phone number',
    email: 'Email address',
    catalogue: 'Catalogue URL',
    joinOnline: 'Join online URL',
    eventsUrl: 'Events URL',
    androidApp: 'Android app URL',
    iOSApp: 'iOS app URL',
    operatingOrganisation: 'Operating organisation',
    notes: 'Notes'
  }))
    data[key] = text(record[old])
  const effectiveGss =
    record.slug === 'guernsey' && record.gss === 'L99999999' ? 'L99999998' : record.gss
  data['Local authority code'] = gssCode(effectiveGss)
  if (data['Local authority code']?.startsWith('S')) data.Country = 'Scotland'
  else if (data['Local authority code']?.startsWith('W')) data.Country = 'Wales'
  else if (data['Local authority code']?.startsWith('N')) data.Country = 'Northern Ireland'
  else if (
    data['Local authority code']?.startsWith('L') ||
    data['Local authority code']?.startsWith('M')
  )
    data.Country = 'Crown Dependencies'
  for (const social of record.social || []) {
    const key = {
      twitter: 'Twitter URL',
      facebook: 'Facebook URL',
      instagram: 'Instagram URL',
      youtube: 'YouTube URL'
    }[social.channel]
    if (key && !data[key]) data[key] = text(social.url)
  }
  return envelope(record, data)
}

/**
 * Preserve useful non-schema information in the audit instead of a second live model.
 * @param {object} record - Original source record.
 * @param {'libraries'|'authorities'} kind - Owning source collection.
 * @returns {object} Non-empty details whose interpretation was not safely inferred.
 */
export function unmappedDetails(record, kind) {
  const details = {}
  /** @param {string} field - Audit category. @param {unknown} value - Candidate non-empty source details. @returns {void} */
  const keep = (field, value) => {
    if (value && (!Array.isArray(value) || value.length)) details[field] = value
  }
  if (kind === 'libraries') {
    for (const field of ['catalogue', 'joinOnline', 'virtualTourUrl']) keep(field, record[field])
    keep(
      'accessibility',
      record.accessibility?.filter(
        (value) => !['step-free-access', 'accessible-toilet', 'hearing-loop-system'].includes(value)
      )
    )
    keep(
      'serviceLinks',
      record.services?.filter((item) => item.url)
    )
    keep('openingExceptions', record.openingTimes?.exceptions)
    if (record.town && !normalized(record.address).includes(normalized(record.town)))
      keep('town', record.town)
  } else {
    keep('about', record.about)
    keep(
      'social',
      record.social?.filter(
        (item) => !['twitter', 'facebook', 'instagram', 'youtube'].includes(item.channel)
      )
    )
  }
  return details
}

/**
 * Apply the first explicit maintainer policy matching an audit item's displayed reason.
 * Resolution records a workflow decision, never proof that a candidate or URL is valid.
 * @param {object} item - Original review evidence, retained without changing its values.
 * @param {object[]} resolutions - Ordered, explicit maintainer policies.
 * @returns {object|null} Audited decision or null when the check must remain open.
 * @throws {Error} For malformed policies or unsupported conditional matching.
 */
export function resolveReviewItem(item, resolutions) {
  for (const policy of resolutions) {
    if (
      (!policy.kind && !policy.check_reason) ||
      !['approved', 'deferred', 'archived'].includes(policy.status) ||
      !policy.decision ||
      !/^\d{4}-\d{2}-\d{2}$/.test(policy.decided_on || '') ||
      !policy.rationale?.trim() ||
      (policy.condition &&
        policy.condition !== 'null-postcode-and-lookup' &&
        policy.condition !== 'terminated-postcode-closed' &&
        policy.condition !== 'verified-civic-building')
    ) {
      throw new Error(
        'Review resolutions require a selector, status, decision, date, rationale and supported condition'
      )
    }
    if (policy.kind && policy.kind !== item.kind) continue
    if (
      policy.check_reason &&
      policy.check_reason !==
        (item.reason || 'Review the supporting evidence in the migration audit')
    )
      continue
    if (policy.exclude_kinds?.includes(item.kind)) continue
    if (
      policy.condition === 'null-postcode-and-lookup' &&
      !(item.kind === 'postcode-lookup' && item.postcode === null && item.result === null)
    )
      continue
    if (
      policy.condition === 'terminated-postcode-closed' &&
      !(
        item.kind === 'postcode-lookup' &&
        item.result?.status === 'terminated' &&
        (item.status === 'Closed (permanent)' || item.permanentlyClosed)
      )
    )
      continue
    if (
      policy.condition === 'verified-civic-building' &&
      !(
        item.kind === 'postcode-lookup' &&
        item.result?.status === 'terminated' &&
        (policy.ids?.includes(item.id) || policy.postcodes?.includes(item.postcode))
      )
    )
      continue
    return {
      status: policy.status,
      decision: policy.decision,
      decided_on: policy.decided_on,
      rationale: policy.rationale
    }
  }
  return null
}

/**
 * Attach only open checks while retaining approved, deferred and archived evidence.
 * Stable IDs exclude resolution metadata so a decision cannot break existing audit links.
 * @param {object[]} records - Canonical records whose annotations are updated in place.
 * @param {object[]} review - Audit evidence receiving stable IDs and resolution metadata.
 * @param {object[]} [resolutions] - Maintainer policies; no data or dates are changed.
 * @returns {void} Canonical values and validation exceptions are untouched.
 */
export function attachManualChecks(records, review, resolutions = []) {
  const checks = new Map()
  review.forEach((item) => {
    const evidence = { ...item }
    delete evidence.review_id
    delete evidence.resolution
    item.review_id = `review_${createHash('sha256').update(JSON.stringify(evidence)).digest('hex').slice(0, 24)}`
    const resolution = resolveReviewItem(item, resolutions)
    if (resolution) {
      item.resolution = resolution
      return
    }
    delete item.resolution
    const ids = item.id === undefined ? item.ids || [] : [item.id]
    for (const id of ids) {
      if (!checks.has(id)) checks.set(id, new Map())
      const byKind = checks.get(id)
      if (!byKind.has(item.kind))
        byKind.set(item.kind, {
          kind: item.kind,
          reason: item.reason || 'Review the supporting evidence in the migration audit',
          audit_refs: []
        })
      const reference = `migration/directory/report.json#${item.review_id}`
      if (!byKind.get(item.kind).audit_refs.includes(reference))
        byKind.get(item.kind).audit_refs.push(reference)
    }
  })
  for (const record of records) {
    const items = checks.get(record.id)
    if (items) record.manual_checks = [...items.values()]
    else delete record.manual_checks
  }
}

/** @param {{source: string, row: number}} source - Input row. @returns {string} Source/physical-row override key. */
function sourceKey(source) {
  return `${source.source}:${source.row}`
}

/**
 * Resolve authority-scoped candidates and withhold ambiguous or duplicate source claims.
 * Overrides can choose only candidates already passing the building safety rules.
 * @param {object} original - Preserved LibraryOn collections.
 * @param {{sources: object[], rules: object[]}} inputs - Supporting rows and corrections.
 * @param {object} [overrides] - Reviewed authority aliases and candidate selections.
 * @returns {{matches: object[], targets: object[], authorityBySlug: Map}} Matching plan.
 */
export function planMatches(original, inputs, overrides = {}) {
  const authorityBySlug = new Map()
  for (const { record } of original.authorities) {
    const rec = { ...record }
    if (niSlugs.has(rec.slug)) continue
    if (rec.slug === 'guernsey' && rec.gss === 'L99999999') {
      rec.gss = 'L99999998'
    }
    authorityBySlug.set(rec.slug, rec)
  }
  authorityBySlug.set('northern-ireland', niAuthority)

  const aliases = new Map()
  for (const authority of authorityBySlug.values()) {
    const key = authorityKey(authority.name)
    if (!aliases.has(key)) aliases.set(key, [])
    aliases.get(key).push(authority.slug)
  }
  for (const slug of niSlugs) {
    const key = authorityKey(slug.replace(/-/g, ' '))
    if (!aliases.has(key)) aliases.set(key, [])
    aliases.get(key).push('northern-ireland')
  }
  aliases.set('northern ireland', ['northern-ireland'])
  aliases.set('libraries ni', ['northern-ireland'])

  const explicitAliases = {
    bristol: 'bristol',
    hull: 'kingston-upon-hull',
    'herefordshire county': 'herefordshire',
    dorset: 'dorset',
    'st helens': 'st-helens'
  }
  const targets = original.libraries.map(({ file, record }) => {
    const isNi =
      niSlugs.has(record.authority) ||
      record.slug.includes('larne') ||
      record.postcode?.startsWith('BT')
    const authSlug = isNi ? 'northern-ireland' : record.authority
    const targetRec = isNi ? { ...record, authority: 'northern-ireland' } : record
    const correction = correctedPostcode(record.postcode, record.name, inputs.rules)
    return {
      file,
      record: targetRec,
      id: record.id,
      name: record.name,
      address: record.address,
      postcode: normalizePostcode(record.postcode),
      correctedPostcode: correction.postcode,
      authority: authSlug
    }
  })
  const matches = []
  for (const source of inputs.sources) {
    const alias =
      overrides.authority_aliases?.[source.authority] ||
      explicitAliases[authorityKey(source.authority)]
    source.authoritySlug =
      alias && authorityBySlug.has(alias)
        ? alias
        : aliases.get(authorityKey(source.authority))?.length === 1
          ? aliases.get(authorityKey(source.authority))[0]
          : null
    const candidates = targets.filter(
      (target) =>
        target.authority === source.authoritySlug &&
        (buildingMatch(target, source) ||
          buildingMatch({ ...target, postcode: target.correctedPostcode }, source))
    )
    const approved = overrides.matches?.[sourceKey(source)]
    const chosen = approved
      ? candidates.find((candidate) => candidate.id === approved)
      : candidates.length === 1
        ? candidates[0]
        : null
    matches.push({
      source,
      target: chosen || null,
      candidates: candidates.map((candidate) => candidate.id)
    })
  }
  for (const match of matches) {
    if (
      match.target &&
      matches.some(
        (other) =>
          other !== match &&
          other.source.source === match.source.source &&
          other.target?.id === match.target.id
      )
    ) {
      match.ambiguous = true
    }
  }
  for (const match of matches) if (match.ambiguous) match.target = null
  return { matches, targets, authorityBySlug }
}

/**
 * Require a located UPRN, exact current postcode and an independent point within 100m.
 * @param {object} source - Strongly matched supporting row with a candidate UPRN.
 * @param {object} target - LibraryOn building and independently recorded coordinate.
 * @param {object} lookups - Cached NSUL and ONSPD evidence.
 * @returns {object} Acceptance, reason, and distance/provenance when available.
 */
export function uprnEvidence(source, target, lookups) {
  const uprn = source.data['Unique property reference number']
  const lookup = lookups.uprns?.[uprn]
  if (!uprn || !lookup || lookup.status !== 'found')
    return { accepted: false, reason: 'UPRN not independently located' }
  if (lookup.postcode !== target.postcode)
    return { accepted: false, reason: 'UPRN postcode association differs or is missing' }
  const miles = distanceMiles(target.record, lookup)
  if (miles === null || miles > 0.0621371)
    return {
      accepted: false,
      reason: 'UPRN is missing coordinates or more than 100 metres from LibraryOn point',
      miles
    }
  const postcode = lookups.postcodes?.[target.postcode]
  if (postcode?.status !== 'found')
    return { accepted: false, reason: 'Postcode not independently verified' }
  return {
    accepted: true,
    reason:
      'Unique authority/name/address/postcode match; independently located UPRN within 100m and identical postcode',
    miles,
    lookup: lookup.url
  }
}

/**
 * Enrich Northern Ireland library records with live verified facilities, opening hours,
 * contact info and location pins from the official Libraries NI website directory.
 * @param {object[]} libraries - All directory libraries.
 * @param {Function} change - Tracked mutation callback recording audited changes.
 * @returns {void}
 */
export function enrichNorthernIrelandLibraries(libraries, change) {
  const scrapedFile = new URL('libraries-ni-scraped.json', auditRoot)
  if (!existsSync(scrapedFile)) return
  const scraped = json(scrapedFile)
  const scrapedByUrl = new Map(scraped.map((item) => [item.url, item]))
  const scrapedBySlug = new Map(
    scraped.map((item) => {
      const parts = item.url.split('/').filter(Boolean)
      return [parts[parts.length - 1], item]
    })
  )

  for (const { record } of libraries) {
    if (record.authority !== 'northern-ireland') continue
    const slug = record.slug
    let match =
      scrapedByUrl.get(record.data.URL) ||
      scrapedBySlug.get(slug) ||
      scrapedBySlug.get(`${slug}-library`)
    if (slug === 'chichester') match = scrapedBySlug.get('chichester-library')
    if (slug === 'cultural-heritage-service-library')
      match = scrapedBySlug.get('cultural-heritage-service-library-armagh')
    if (!match) continue

    const evidence = {
      source: 'libraries-ni-website',
      evidence: match.url,
      reason: 'Official Libraries NI branch directory (librariesni.org.uk)'
    }

    if (match.url && record.data.URL !== match.url) {
      change(record, 'URL', match.url, evidence)
    }

    if (match.phone && !record.data['Phone number']) {
      change(record, 'Phone number', match.phone, evidence)
    }
    if (
      match.email &&
      (!record.data['Email address'] ||
        record.data['Email address'] === 'enquiries@librariesni.org.uk')
    ) {
      change(record, 'Email address', match.email, evidence)
    }

    for (const [facility, value] of Object.entries(match.facilities)) {
      if (value === 'Yes' && record.data[facility] !== 'Yes') {
        change(record, facility, 'Yes', evidence)
      }
    }

    if (slug === 'enniskillen-library') {
      change(record, 'Status', 'Closed (temporary)', {
        ...evidence,
        reason:
          'Customer Notice: main building closed for redevelopment; interim service available at Fermanagh House'
      })
      change(
        record,
        'Special hours',
        'Main building temporarily closed for redevelopment; interim service available at Fermanagh House',
        evidence
      )
    } else {
      for (const [hourField, value] of Object.entries(match.hours)) {
        if (value !== record.data[hourField]) {
          change(record, hourField, value, evidence)
        }
      }
    }

    const isBelfastCentralFallback =
      slug !== 'belfast-central-library' &&
      match.latitude === 54.6028288 &&
      match.longitude === -5.930998199999999
    if (match.latitude && match.longitude && !isBelfastCentralFallback) {
      if (!record.data.Latitude || !record.data.Longitude) {
        change(record, 'Latitude', match.latitude, evidence)
        change(record, 'Longitude', match.longitude, evidence)
      } else {
        const dist = Math.hypot(
          record.data.Latitude - match.latitude,
          record.data.Longitude - match.longitude
        )
        if (dist > 0.005) {
          change(record, 'Latitude', match.latitude, evidence)
          change(record, 'Longitude', match.longitude, evidence)
        }
      }
    }
  }
}

/** @param {string} field - Schema field. @param {unknown} value - Candidate value. @param {object} schema - Owning schema. @returns {boolean} Whether this field passes without considering other required gaps. */
function validField(field, value, schema) {
  return !dataIssues({ ...blank(schema), [field]: value }, schema).some(
    (issue) => issue.field === field
  )
}

/**
 * Rebuild an audited migration plan from the baseline without inventing evidence.
 * Dry runs update audit files only; writes also enforce the replay manifest.
 * @param {{write?: boolean}} [options] - Whether to apply planned canonical records.
 * @returns {Promise<object>} Planned records, audit report and matching plan.
 */
export async function migrate({ write = false } = {}) {
  const original = baseline()
  const originalUprns = new Map(
    original.libraries.map(({ record }) => [record.id, normalizeUprn(record.uprn)])
  )
  const inputs = await readInputs()
  const overridesFile = new URL('overrides.json', auditRoot)
  if (!existsSync(overridesFile))
    writeJson(overridesFile, {
      authority_aliases: {},
      matches: {},
      excluded_sources: [],
      field_overrides: [],
      review_resolutions: []
    })
  const overrides = json(overridesFile)
  const cacheFile = new URL('lookups.json', auditRoot)
  const lookups = existsSync(cacheFile) ? json(cacheFile) : { postcodes: {}, uprns: {}, urls: {} }
  const report = {
    policy: {
      priority: ['LibraryOn baseline', 'libraries.csv', 'Arts Council 2024'],
      preserveUpdateDates: true,
      maxUprnDistanceMetres: 100
    },
    sources: [],
    changes: [],
    conflicts: [],
    review: [],
    matches: [],
    added: [],
    validation: []
  }
  report.lookupProducts = lookups.ons || {}
  report.migrationInputs = [
    'migration/directory/libraryon-baseline.json.gz',
    'migration/directory/overrides.json',
    'migration/directory/libraries-ni-scraped.json',
    'src/data/schemas/libraries.json',
    'src/data/schemas/library-services.json',
    'scripts/directory/migrate.mjs',
    'scripts/directory/lookups.mjs'
  ].map((file) => ({
    file,
    sha256: createHash('sha256')
      .update(readFileSync(new URL(file, root)))
      .digest('hex')
  }))
  for (const file of [
    'libraries.csv',
    'library-services.json',
    'libraries.json',
    'Services-Grid view.csv',
    'English Public Libraries Location Dataset 2024.xlsx',
    'load_england_2023.sql'
  ]) {
    report.sources.push({
      file: `tempdata/${file}`,
      sha256: createHash('sha256')
        .update(readFileSync(new URL(`tempdata/${file}`, root)))
        .digest('hex')
    })
  }
  const plan = planMatches(original, inputs, overrides)
  const authorities = original.authorities
    .filter(({ record }) => !niSlugs.has(record.slug))
    .map(({ file, record }) => ({
      file,
      record: convertAuthority(record)
    }))
  authorities.push({
    file: 'northern-ireland.json',
    record: convertAuthority(niAuthority)
  })
  const libraries = original.libraries.map(({ file, record }) => {
    const isNi =
      niSlugs.has(record.authority) ||
      record.slug.includes('larne') ||
      record.postcode?.startsWith('BT')
    const authSlug = isNi ? 'northern-ireland' : record.authority
    const targetRec = isNi ? { ...record, authority: 'northern-ireland' } : record
    return {
      file: `${authSlug || 'unassigned'}--${record.slug}.json`,
      record: convertLibrary(targetRec, plan.authorityBySlug.get(authSlug), report)
    }
  })
  const byId = new Map(libraries.map((item) => [item.record.id, item.record]))
  /** @param {object} record - Target. @param {string} field - Canonical field. @param {unknown} value - Approved value. @param {object} evidence - Source and rationale retained alongside before/after values. @returns {void} */
  const change = (record, field, value, evidence) => {
    const before = record.data[field]
    if (JSON.stringify(before) === JSON.stringify(value)) return
    report.changes.push({ id: record.id, field, before, after: value, ...evidence })
    record.data[field] = value
  }
  for (const match of plan.matches) {
    const source = match.source
    const key = sourceKey(source)
    if (overrides.excluded_sources.includes(key)) continue
    report.matches.push({
      source: source.source,
      row: source.row,
      name: source.name,
      authority: source.authority,
      postcode: source.postcode,
      address: source.address,
      correction: source.correction,
      target: match.target?.id || null,
      candidates: match.candidates
    })
    if (!match.target) continue
    const record = byId.get(match.target.id)
    for (const [field, value] of Object.entries(source.data)) {
      if (
        value === null ||
        [
          'Local authority',
          'Local authority code',
          'Library name',
          'Postcode',
          'Address 1',
          'Address 2',
          'Address 3',
          'Status'
        ].includes(field)
      )
        continue
      if (field === 'Year closed' && record.data.Status !== 'Closed (permanent)') {
        report.conflicts.push({
          id: record.id,
          field,
          current: record.data.Status,
          candidate: value,
          source: key,
          decision: 'retain-libraryon-status; historical closure may refer to a move or reopening'
        })
        continue
      }
      if (
        /hours$/.test(field) ||
        [
          'Statutory',
          'Type of library',
          'URL',
          'Email address',
          'Co-located',
          'Co-located with',
          'Notes'
        ].includes(field)
      ) {
        if (value !== record.data[field])
          report.conflicts.push({
            id: record.id,
            field,
            current: record.data[field],
            candidate: value,
            source: key,
            decision: 'retain-current; historical/time-sensitive evidence only'
          })
        continue
      }
      if (record.data[field] !== null) {
        if (JSON.stringify(value) !== JSON.stringify(record.data[field]))
          report.conflicts.push({
            id: record.id,
            field,
            current: record.data[field],
            candidate: value,
            source: key,
            decision: 'retain-libraryon-or-higher-priority-source'
          })
        continue
      }
      if (!validField(field, value, directorySchemas.libraries)) {
        report.review.push({
          kind: 'invalid-source-value',
          id: record.id,
          source: key,
          field,
          value
        })
        continue
      }
      if (field === 'Unique property reference number') {
        const evidence = uprnEvidence(source, match.target, lookups)
        if (!evidence.accepted) {
          report.review.push({
            kind: 'uprn',
            id: record.id,
            source: key,
            candidate: value,
            ...evidence
          })
          continue
        }
        const conflicting = plan.matches.filter(
          (other) =>
            other.target?.id === record.id &&
            other.source.data[field] &&
            other.source.data[field] !== value
        )
        if (conflicting.length) {
          report.review.push({
            kind: 'uprn-conflict',
            id: record.id,
            source: key,
            candidate: value,
            alternatives: conflicting.map((other) => ({
              source: sourceKey(other.source),
              value: other.source.data[field]
            }))
          })
          continue
        }
        change(record, field, value, { source: key, evidence })
        const lookup = lookups.uprns?.[value]
        if (lookup?.latitude && lookup?.longitude) {
          change(record, 'Latitude', lookup.latitude, {
            source: key,
            evidence: 'Coordinates updated from verified UPRN location'
          })
          change(record, 'Longitude', lookup.longitude, {
            source: key,
            evidence: 'Coordinates updated from verified UPRN location'
          })
        }
      } else {
        change(record, field, value, {
          source: key,
          evidence: 'Unique authority/name/address/postcode match; fill missing durable value'
        })
      }
    }
    for (const field of ['Statutory']) {
      const value = source.data[field]
      if (record.data[field] === null && ['Yes', 'No'].includes(value)) {
        if (source.source === 'arts-council-2024') {
          change(record, field, value, {
            source: key,
            evidence:
              'Arts Council England 2024 official statutory dataset; LibraryOn has no statutory value'
          })
        } else {
          const corroborated = plan.matches.some(
            (other) =>
              other.target?.id === record.id &&
              other.source.source !== source.source &&
              other.source.data[field] === value
          )
          if (corroborated)
            change(record, field, value, {
              source: key,
              evidence: 'Two matched supporting datasets agree; LibraryOn has no statutory value'
            })
        }
      }
    }
    for (const field of ['Type of library']) {
      const value = source.data[field]
      if (record.data[field] === null && ['LAL', 'LAL-', 'CL', 'CRL', 'ICL'].includes(value)) {
        change(record, field, value, {
          source: key,
          evidence: 'Matched supporting dataset provides operating model'
        })
      }
    }
  }
  const occupied = libraries.map(({ record }) => ({
    authority: record.authority,
    name: record.data['Library name'],
    postcode: record.data.Postcode,
    address: record.data['Address 1'],
    uprn: record.data['Unique property reference number']
  }))
  for (const match of plan.matches) {
    const source = match.source
    if (match.target || overrides.excluded_sources.includes(sourceKey(source))) continue
    const closed = source.data['Year closed']
    const authority = plan.authorityBySlug.get(source.authoritySlug)
    const nearName = occupied.filter(
      (item) =>
        item.authority === source.authoritySlug && nameKey(item.name) === nameKey(source.name)
    )
    const sameBuilding = occupied.filter((item) =>
      possibleSameBuilding(item, {
        ...source,
        authority: source.authoritySlug,
        uprn: source.data['Unique property reference number']
      })
    )
    if (
      !closed ||
      !authority ||
      !source.postcode ||
      !source.address ||
      match.candidates.length ||
      sameBuilding.length ||
      nearName.some((item) => item.postcode === source.postcode)
    ) {
      report.review.push({
        kind: 'unmatched-source',
        source: sourceKey(source),
        name: source.name,
        address: source.address,
        postcode: source.postcode,
        yearClosed: closed,
        candidates: match.candidates,
        reason: sameBuilding.length
          ? 'Possible existing building: no duplicate added'
          : 'Not enough evidence for a unique closed building; open historical rows require review'
      })
      continue
    }
    const slug = `${normalized(source.name).replace(/ /g, '-')}-closed-${closed}-${source.postcode.replace(/ /g, '').toLowerCase()}`
    const id = `historical_${createHash('sha256')
      .update(`${authority.slug}|${source.postcode}|${normalized(source.address)}`)
      .digest('hex')
      .slice(0, 16)}`
    const pcLookup = source.postcode ? lookups.postcodes?.[source.postcode] : null
    const data = {
      ...source.data,
      'Local authority': authority.name,
      'Local authority code': gssCode(authority.gss),
      Status: 'Closed (permanent)',
      'Unique property reference number': null,
      Latitude: pcLookup?.latitude ?? source.data.Latitude ?? null,
      Longitude: pcLookup?.longitude ?? source.data.Longitude ?? null
    }
    for (const day of days)
      for (const type of ['staffed', 'unstaffed']) data[`${day} ${type} hours`] = null
    const record = envelope({ id, slug, authority: authority.slug, updated_on: null }, data)
    libraries.push({ file: `${authority.slug}--${slug}.json`, record })
    occupied.push({
      authority: authority.slug,
      name: source.name,
      postcode: source.postcode,
      address: source.address
    })
    report.added.push({
      id,
      source: sourceKey(source),
      name: source.name,
      address: source.address,
      postcode: source.postcode,
      yearClosed: closed,
      latitude: data.Latitude,
      longitude: data.Longitude,
      originalSourceRow: source.raw,
      relatedCurrentBuildings: nearName
    })
  }
  for (const added of overrides.added_records || []) {
    const authority = plan.authorityBySlug.get(added.authority)
    if (!authority) throw new Error(`Unknown authority in added_record: ${added.authority}`)
    const pcLookup = added.data.Postcode ? lookups.postcodes?.[added.data.Postcode] : null
    const data = {
      ...blank(directorySchemas.libraries),
      ...added.data,
      'Local authority': authority.name,
      'Local authority code': gssCode(authority.gss),
      Latitude: added.data.Latitude ?? pcLookup?.latitude ?? null,
      Longitude: added.data.Longitude ?? pcLookup?.longitude ?? null
    }
    const record = envelope(
      {
        id: added.id,
        slug: added.slug,
        authority: added.authority,
        updated_on: added.updated_on || null
      },
      data
    )
    libraries.push({ file: `${added.authority}--${added.slug}.json`, record })
    byId.set(record.id, record)
    report.added.push({
      id: added.id,
      source: 'reviewed-override',
      name: added.data['Library name'],
      address: added.data['Address 1'],
      postcode: added.data.Postcode,
      yearClosed: added.data['Year closed']
    })
  }
  for (const { record } of libraries) {
    if (record.data.Statutory !== null) continue
    const authority = plan.authorityBySlug.get(record.authority)
    const code = record.data['Local authority code'] || ''
    const country = code.startsWith('N')
      ? 'Northern Ireland'
      : code.startsWith('S')
        ? 'Scotland'
        : code.startsWith('W')
          ? 'Wales'
          : code.startsWith('L') || code.startsWith('M')
            ? 'Crown Dependencies'
            : authority?.country || (record.slug.includes('larne') ? 'Northern Ireland' : 'England')

    if (country === 'Northern Ireland') {
      change(record, 'Statutory', 'Yes', {
        source: 'devolved-statutory-policy',
        evidence:
          'Libraries Act (Northern Ireland) 2008 statutory public library network (Libraries NI)'
      })
    } else if (country === 'Scotland') {
      change(record, 'Statutory', 'Yes', {
        source: 'devolved-statutory-policy',
        evidence: 'Local Government etc. (Scotland) Act 1994 s.163 statutory duty'
      })
    } else if (country === 'Wales') {
      change(record, 'Statutory', 'Yes', {
        source: 'devolved-statutory-policy',
        evidence: 'Public Libraries and Museums Act 1964 s.7 statutory duty (Wales)'
      })
    } else if (country === 'Crown Dependencies') {
      const nonStatutoryCommunity = [
        'la-nouvelle-maraitaine-community-library',
        'rosaire-court-community-library',
        'the-bridge-community-library',
        'the-western-community-library'
      ]
      const isCommunity = nonStatutoryCommunity.some((slug) => record.slug.includes(slug))
      change(record, 'Statutory', isCommunity ? 'No' : 'Yes', {
        source: 'crown-dependency-statutory-policy',
        evidence: isCommunity
          ? 'Non-statutory community branch / extra-statutory access point'
          : 'Domestic public library mandate (States of Guernsey charter, Public Library (Jersey) Law 1987, Acts of Tynwald)'
      })
    } else {
      if (record.data['Type of library'] === 'ICL') {
        change(record, 'Statutory', 'No', {
          source: 'statutory-operation-policy',
          evidence:
            'Independent community library operating outside the statutory library authority network'
        })
      } else {
        change(record, 'Statutory', 'Yes', {
          source: 'statutory-authority-policy',
          evidence: 'Public Libraries and Museums Act 1964 s.7 statutory library duty (England)'
        })
      }
    }
  }
  for (const { record } of libraries) {
    if (record.data.Status === 'Closed (permanent)') {
      const wasIndependent = record.data['Type of library'] === 'ICL'
      const targetStatutory = wasIndependent ? 'No' : 'Yes'
      if (record.data.Statutory !== targetStatutory) {
        change(record, 'Statutory', targetStatutory, {
          source: 'historical-statutory-policy',
          evidence: wasIndependent
            ? 'Independent community library; non-statutory prior to closure'
            : 'Statutory public library service point prior to permanent closure'
        })
      }
    }
  }
  enrichNorthernIrelandLibraries(libraries, change)
  for (const override of overrides.field_overrides) {
    if (!override.evidence || !override.reason)
      throw new Error('Field overrides require evidence and a reason')
    const record = [...libraries, ...authorities].find(
      (item) => item.record.id === override.id
    )?.record
    const schema = libraries.some((item) => item.record === record)
      ? directorySchemas.libraries
      : directorySchemas.authorities
    if (!record || !validField(override.field, override.value, schema))
      throw new Error(`Invalid override ${override.id}: ${override.field}`)
    if (JSON.stringify(record.data[override.field]) !== JSON.stringify(override.before))
      throw new Error(`Stale override ${override.id}: ${override.field}`)
    change(record, override.field, override.value, {
      source: 'reviewed-override',
      evidence: override.evidence,
      reason: override.reason
    })
  }
  for (const { record } of libraries) {
    const uprn = record.data['Unique property reference number']
    if (!uprn) continue
    const lookup = lookups.uprns?.[String(uprn)]
    const targetPostcode = record.data.Postcode
    const pcLookup = lookups.postcodes?.[targetPostcode]
    const valid = lookup && lookup.status === 'found'
    const sameAuth =
      !lookup?.authorityCode ||
      !pcLookup?.authorityCode ||
      lookup.authorityCode === pcLookup.authorityCode ||
      (lookup.authorityCode.startsWith('N') && pcLookup.authorityCode.startsWith('N'))
    const pcMiles = pcLookup?.latitude && lookup?.latitude ? distanceMiles(pcLookup, lookup) : null
    const close =
      (lookup?.postcode === targetPostcode && (pcMiles === null || pcMiles <= 0.621371)) ||
      (pcMiles !== null && pcMiles <= 0.310686)

    if (!valid || !sameAuth || !close) {
      change(record, 'Unique property reference number', null, {
        source: 'uprn-verification',
        evidence: 'Cleared invalid or unlikely UPRN failing NSUL authority/postcode proximity'
      })
    } else if (lookup?.latitude && lookup?.longitude) {
      change(record, 'Latitude', lookup.latitude, {
        source: 'uprn-location',
        evidence: 'Coordinates updated from verified UPRN location'
      })
      change(record, 'Longitude', lookup.longitude, {
        source: 'uprn-location',
        evidence: 'Coordinates updated from verified UPRN location'
      })
    }
  }
  for (const { record } of authorities) {
    for (const field of [
      'Service URL',
      'Catalogue URL',
      'Join online URL',
      'Android app URL',
      'iOS app URL'
    ]) {
      const current = record.data[field]
      const lookup = lookups.urls?.[current]
      if (
        current &&
        (!lookup || lookup.status !== 'ok' || lookup.crossDomain || lookup.genericRedirect)
      )
        report.review.push({
          kind: 'current-service-url',
          id: record.id,
          field,
          current,
          lookup: lookup || null,
          reason: 'Existing LibraryOn URL retained; lookup needs editorial review'
        })
    }
    const rows = inputs.grid.filter((row) => row.Code === record.data['Local authority code'])
    if (rows.length !== 1) {
      report.review.push({
        kind: 'service-match',
        id: record.id,
        code: record.data['Local authority code'],
        count: rows.length
      })
      continue
    }
    const row = rows[0]
    if (authorityKey(row.Name) !== authorityKey(record.data['Local authority']))
      report.review.push({
        kind: 'service-name',
        id: record.id,
        gridName: row.Name,
        currentName: record.data['Local authority'],
        reason: 'Matched by unique GSS code; check name discrepancy'
      })
    for (const [field, raw] of Object.entries(row)) {
      const value = text(raw)
      if (!value || !(field in record.data)) continue
      if (record.data[field]) {
        if (record.data[field] !== value)
          report.conflicts.push({
            id: record.id,
            field,
            current: record.data[field],
            candidate: value,
            source: 'services-grid',
            decision: 'retain-libraryon'
          })
        continue
      }
      const evidence = lookups.urls?.[value]
      if (field.endsWith('URL')) {
        if (
          !validField(field, value, directorySchemas.authorities) ||
          evidence?.status !== 'ok' ||
          evidence.crossDomain ||
          !evidence.libraryRelevant ||
          evidence.genericRedirect
        ) {
          report.review.push({
            kind: 'service-url',
            id: record.id,
            field,
            candidate: value,
            lookup: evidence || null
          })
          continue
        }
        change(record, field, value, { source: 'services-grid', evidence })
      } else if (['Ebook supplier', 'Audiobook supplier'].includes(field)) {
        report.review.push({
          kind: 'historical-supplier',
          id: record.id,
          field,
          candidate: value,
          reason: 'Historical grid does not establish a current supplier'
        })
      } else if (
        field.startsWith('Library management system') ||
        field === 'Online catalogue system'
      ) {
        const catalogue = record.data['Catalogue URL']
        const lookup = lookups.urls?.[catalogue]
        const signatures = {
          spydus: /spydus/i,
          sierra: /sierra/i,
          symphony: /symphony/i,
          koha: /koha/i,
          alto: /\balto\b/i,
          prism: /prism/i,
          folio: /folio/i
        }
        const signature = signatures[normalized(value)]
        if (
          signature &&
          lookup?.status === 'ok' &&
          !lookup.genericRedirect &&
          !lookup.crossDomain &&
          signature.test(`${lookup.finalUrl} ${lookup.title} ${lookup.signals || ''}`)
        )
          change(record, field, value, {
            source: 'services-grid',
            evidence: { url: catalogue, ...lookup }
          })
        else
          report.review.push({
            kind: 'historical-lms',
            id: record.id,
            field,
            candidate: value,
            catalogue,
            lookup: lookup || null,
            reason: 'Current catalogue does not independently confirm historical system'
          })
      }
    }
  }
  const uprnOwners = new Map()
  for (const { record } of libraries) {
    const uprn = record.data['Unique property reference number']
    if (!uprn) continue
    if (!uprnOwners.has(uprn)) uprnOwners.set(uprn, [])
    uprnOwners.get(uprn).push(record)
  }
  for (const [uprn, owners] of uprnOwners) {
    if (owners.length < 2) continue
    report.review.push({ kind: 'duplicate-uprn', uprn, ids: owners.map((record) => record.id) })
    for (const record of owners) {
      if (!originalUprns.get(record.id))
        change(record, 'Unique property reference number', null, {
          source: 'duplicate-check',
          evidence: 'UPRN claimed by multiple records; withheld pending review'
        })
    }
  }
  for (const [kind, records] of [
    ['libraries', libraries],
    ['authorities', authorities]
  ]) {
    for (const { record } of records) {
      record.validation_exceptions = dataIssues(record.data, directorySchemas[kind]).map(
        (issue) => ({
          ...issue,
          reason:
            issue.code === 'required'
              ? 'Not recorded by LibraryOn and not safely established from matched supporting sources'
              : 'Preserved source value outside supplied schema; requires editorial verification'
        })
      )
      report.validation.push(
        ...record.validation_exceptions.map((issue) => ({ id: record.id, ...issue }))
      )
      if (kind === 'libraries') {
        const target = plan.targets.find((item) => item.id === record.id)
        if (target && target.correctedPostcode !== target.postcode)
          report.review.push({
            kind: 'historical-postcode-correction',
            id: record.id,
            current: target.postcode,
            candidate: target.correctedPostcode,
            lookup: lookups.postcodes?.[target.correctedPostcode] || null,
            reason:
              'SQL correction is matching evidence, not permission to override current LibraryOn data'
          })
        const postcode = lookups.postcodes?.[record.data.Postcode]
        if (!postcode || postcode.status !== 'found')
          report.review.push({
            kind: 'postcode-lookup',
            id: record.id,
            postcode: record.data.Postcode,
            result: postcode || null,
            status: record.data.Status
          })
        const uprn = record.data['Unique property reference number']
        if (uprn && originalUprns.get(record.id))
          report.review.push({
            kind: 'original-uprn',
            id: record.id,
            uprn,
            lookup: lookups.uprns?.[uprn] || null,
            reason: 'Original LibraryOn value retained; inspect lookup evidence'
          })
      }
    }
    validateRecords(
      records.map((item) => item.record),
      kind
    )
  }
  report.unmapped = []
  for (const [kind, sources] of Object.entries(original)) {
    for (const { file, record } of sources) {
      const details = unmappedDetails(record, kind)
      if (!Object.keys(details).length) continue
      const index = report.unmapped.length
      report.unmapped.push({
        id: record.id,
        kind,
        file,
        details,
        baseline: 'migration/directory/libraryon-baseline.json.gz'
      })
      report.review.push({
        kind: 'unmapped-source-details',
        id: record.id,
        fields: Object.keys(details),
        evidence: `migration/directory/report.json#/unmapped/${index}`,
        reason:
          'Source details have no exact Table Schema field; preserved in the audit for manual review, not used as a parallel live model'
      })
    }
  }
  attachManualChecks(
    [...libraries, ...authorities].map(({ record }) => record),
    report.review,
    overrides.review_resolutions || []
  )
  report.summary = {
    originalLibraries: original.libraries.length,
    libraries: libraries.length,
    authorities: authorities.length,
    matchedRows: report.matches.filter((match) => match.target).length,
    addedClosedBuildings: report.added.length,
    filledUprns: libraries.filter(
      ({ record }) =>
        record.data['Unique property reference number'] && !originalUprns.get(record.id)
    ).length,
    changes: report.changes.length,
    review: report.review.length,
    approvedReviews: report.review.filter((item) => item.resolution?.status === 'approved').length,
    deferredReviews: report.review.filter((item) => item.resolution?.status === 'deferred').length,
    archivedReviews: report.review.filter((item) => item.resolution?.status === 'archived').length,
    pendingReviews: report.review.filter((item) => !item.resolution).length,
    validationExceptions: report.validation.length
  }
  writeJson(new URL('report.json', auditRoot), report)
  writeJson(new URL('sql-postcode-corrections.json', auditRoot), inputs.rules)
  if (write) {
    writeMigratedRecords(original, [
      ['libraries', libraries],
      ['authorities', authorities]
    ])
  }
  console.log(JSON.stringify(report.summary, null, 2))
  return { libraries, authorities, report, plan }
}

if (process.argv[1] === fileURLToPath(import.meta.url))
  await migrate({ write: process.argv.includes('--write') })
