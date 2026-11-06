/**
 * @fileoverview Review worklist aggregation and evidence linking for community maintainers.
 */

import { readdirSync, readFileSync } from 'node:fs'
import { validateRecords } from './directory-schema.mjs'
import audit from '../../migration/directory/report.json' with { type: 'json' }

/**
 * @typedef {object} ReviewRow
 * @property {string} key - Collection-qualified entry key.
 * @property {string} collection - Owning directory collection.
 * @property {string} entry - JSON filename without its extension.
 * @property {string} name - Public record name.
 * @property {string} authority - Display authority name.
 * @property {string} publicPath - Public record route.
 * @property {string} editPath - Exact CMS entry route.
 * @property {string} detailPath - Lazy evidence endpoint.
 * @property {number} exceptionCount - Current schema-exception count.
 * @property {number} manualCount - Current manual-check group count.
 * @property {string[]} categories - Filterable issue kinds.
 * @property {number} priority - Lower values are reviewed first.
 * @property {string} searchText - Normalized searchable record and issue text.
 * @property {object[]} exceptions - Exact current schema failures.
 * @property {object[]} manual - Manual checks with ownership-checked evidence.
 */

const urgentReviewKinds = new Set([
  'opening-hours',
  'uprn-conflict',
  'duplicate-uprn',
  'historical-postcode-correction'
])
/** @param {string} value - Machine-readable issue kind. @returns {string} Readable label retaining domain acronyms. */
const reviewLabel = (value) =>
  value
    .replace(/-/g, ' ')
    .replace(/\buprn\b/g, 'UPRN')
    .replace(/\blms\b/g, 'LMS')
    .replace(/\burl\b/g, 'URL')
    .replace(/^./, (initial) => initial.toUpperCase())

/**
 * Join current flags to record-scoped audit evidence, omitting resolved records.
 * Evidence ownership is checked before archived details are exposed in a dialog.
 * @param {Record<string, {file: string, record: object}[]>} groups - Live canonical files.
 * @param {{review?: object[], unmapped?: object[]}} audit - Preserved migration evidence.
 * @returns {ReviewRow[]} Priority-sorted worklist with per-record detail payloads.
 */
export function directoryReviewRows(groups, audit) {
  const evidenceById = new Map((audit.review || []).map((item) => [item.review_id, item]))
  const authorityNames = new Map(
    (groups.authorities || []).map(({ record }) => [record.slug, record.data['Local authority']])
  )
  const rows = []
  for (const [collection, entries] of Object.entries(groups)) {
    for (const { file, record } of entries) {
      const exceptions = record.validation_exceptions || []
      const checks = record.manual_checks || []
      if (!exceptions.length && !checks.length) continue
      const entry = file.replace(/\.json$/, '')
      const isLibrary = collection === 'libraries'
      const name = record.data[isLibrary ? 'Library name' : 'Local authority']
      const authority = isLibrary
        ? authorityNames.get(record.authority) || record.data['Local authority'] || 'Unassigned'
        : name
      const manual = checks.map((check) => ({
        ...check,
        label: reviewLabel(check.kind),
        evidence: check.audit_refs.map((reference) => {
          const reviewId = reference.split('#')[1]
          const evidence = evidenceById.get(reviewId)
          if (!evidence || !(evidence.id === record.id || evidence.ids?.includes(record.id)))
            return {
              review_id: reviewId,
              reason: 'Audit evidence is missing or does not identify this record; requires review'
            }
          const { id, ids, ...details } = evidence
          const unmappedReference = evidence.evidence?.match(
            /^migration\/directory\/report\.json#\/unmapped\/(\d+)$/
          )
          const unmappedSource = unmappedReference
            ? audit.unmapped?.[Number(unmappedReference[1])]
            : null
          return {
            ...details,
            ...(unmappedSource?.id === record.id ? { sourceDetails: unmappedSource.details } : {})
          }
        })
      }))
      rows.push({
        key: `${collection}/${entry}`,
        collection,
        entry,
        name,
        authority,
        publicPath: isLibrary
          ? `/libraries/${record.authority || 'unassigned'}/${record.slug}/`
          : `/libraries/${record.slug}/`,
        editPath: `/admin/#/collections/${collection}/entries/${encodeURIComponent(entry)}`,
        detailPath: `/admin/review-data/${collection}/${encodeURIComponent(entry)}.json`,
        exceptionCount: exceptions.length,
        manualCount: checks.length,
        categories: [
          ...(exceptions.length ? ['validation'] : []),
          ...checks.map((check) => check.kind)
        ],
        priority: checks.some((check) => urgentReviewKinds.has(check.kind))
          ? 0
          : exceptions.length
            ? 1
            : checks.some((check) => check.kind !== 'unmapped-source-details')
              ? 2
              : 3,
        searchText:
          `${name} ${authority} ${exceptions.map((issue) => `${issue.field} ${issue.reason}`).join(' ')} ${checks.map((check) => `${check.kind} ${check.reason}`).join(' ')}`.toLowerCase(),
        exceptions,
        manual
      })
    }
  }
  return rows.sort(
    (first, second) =>
      first.priority - second.priority || first.name.localeCompare(second.name, 'en')
  )
}

/**
 * Omit full evidence from the initial browser index; dialogs fetch it on demand.
 * @param {ReviewRow[]} rows - Joined review rows from directoryReviewRows.
 * @returns {Omit<ReviewRow, 'exceptions'|'manual'>[]} Compact, browser-safe entries.
 */
export function reviewIndex(rows) {
  return rows.map(({ exceptions, manual, ...row }) => row)
}

/**
 * Produce stable filter choices only for issue types present in the current worklist.
 * @param {{categories: string[]}[]} rows - Index or complete review rows.
 * @returns {{value: string, label: string}[]} Sorted category values and display labels.
 */
export function reviewCategories(rows) {
  return [...new Set(rows.flatMap((row) => row.categories))].sort().map((value) => ({
    value,
    label: value === 'validation' ? 'Validation exceptions' : reviewLabel(value)
  }))
}

/**
 * Validate live files using Vite imports in Astro or filesystem reads in Node tests.
 * Audit imports stay server-only; fresh rows reflect current flags rather than cached ones.
 * @returns {ReviewRow[]} Worklist rows with record-scoped evidence.
 */
export function loadDirectoryReview() {
  const bundled = import.meta.env?.SSR
    ? {
        libraries: import.meta.glob('../content/libraries/*.json', {
          eager: true,
          import: 'default'
        }),
        authorities: import.meta.glob('../content/authorities/*.json', {
          eager: true,
          import: 'default'
        })
      }
    : null
  const groups = Object.fromEntries(
    ['libraries', 'authorities'].map((collection) => {
      const directory = new URL(`../content/${collection}/`, import.meta.url)
      const entries = bundled
        ? Object.entries(bundled[collection]).map(([path, record]) => ({
            file: path.split('/').pop(),
            record
          }))
        : readdirSync(directory)
            .filter((file) => file.endsWith('.json'))
            .map((file) => ({
              file,
              record: JSON.parse(readFileSync(new URL(file, directory), 'utf8'))
            }))
      validateRecords(
        entries.map(({ record }) => record),
        collection
      )
      return [collection, entries]
    })
  )
  return directoryReviewRows(groups, audit)
}
