/**
 * @fileoverview Audited, fill-only import of service fines from a pinned public LibraryData snapshot.
 */

import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateRecord } from '../../src/lib/directory/schemaHelpers.mjs'

/**
 * @typedef {object} ServiceFieldsSnapshot
 * @property {string} source - Commit-pinned source URL.
 * @property {string} sha256 - SHA-256 of the original downloaded bytes.
 * @property {Object<string, {source_id: string, name: string, fields: Object<string, number|string|null>}>} records - Source fields keyed by GSS code.
 */

/**
 * @typedef {object} ServiceFieldsPlan
 * @property {Array<{file: string, record: object}>} records - Validated target records.
 * @property {object[]} changes - Proposed field changes with provenance.
 * @property {object[]} conflicts - Non-null editorial values that differ from the source.
 * @property {object[]} unsupported - Target fines without evidence in the source.
 */

/** Commit-pinned historical source; imports never follow the upstream default branch. */
export const serviceFieldsSource =
  'https://raw.githubusercontent.com/LibrariesHacked/librarydata-db/c4bc46abc29e435274a4e6f5d69bf9fd56a891e7/data/services/services.json'
/** Exact source titles mapped to canonical Table Schema field names. */
export const serviceFieldNames = {
  'Adult fine': 'adult_fine',
  'Child fine': 'child_fine',
  'Fine interval': 'fine_interval',
  'Fees and charges URL': 'fees_and_charges_url'
}

/**
 * Validate and compact the Airtable-format source without inferring missing values.
 * @param {Array<{id: string, fields: Object<string, unknown>}>} rows - Original service rows.
 * @param {string} source - Commit-pinned source URL.
 * @param {string} sha256 - Digest of the original source bytes.
 * @returns {ServiceFieldsSnapshot} Auditable snapshot keyed by unique authority codes.
 * @throws {Error} When codes are invalid/duplicated or source field values are invalid.
 */
export function serviceFieldSnapshot(rows, source, sha256) {
  if (!Array.isArray(rows)) throw new Error('Service source must contain an array of records.')
  const records = {}
  for (const row of rows) {
    const code = row.fields?.Code
    if (!/^[ELMNSW]\d{8}$/.test(code || '') || records[code]) {
      throw new Error(`Missing, invalid or duplicate source authority code: ${code}`)
    }
    const fields = {}
    for (const [title, name] of Object.entries(serviceFieldNames)) {
      const value = row.fields[title] ?? null
      if (
        value !== null &&
        (name.endsWith('_fine')
          ? typeof value !== 'number' || !Number.isFinite(value) || value < 0
          : typeof value !== 'string' || !value.trim())
      )
        throw new Error(`Invalid service source value: ${code}: ${title}`)
      if (name === 'fees_and_charges_url' && value !== null && !/^https?:\/\//.test(value)) {
        throw new Error(`Invalid service fees URL: ${code}`)
      }
      fields[name] = value
    }
    records[code] = { source_id: row.id, name: row.fields.Name, fields }
  }
  return { source, sha256, records }
}

/**
 * Plan a fill-only backfill and validate every target before any file is written.
 * @param {Array<{file: string, record: object}>} records - Current canonical service records.
 * @param {ServiceFieldsSnapshot} snapshot - Saved, verified service field observations.
 * @param {{clearUnverified?: boolean}} [options] - Allow the approved removal of paired unsupported zero fines.
 * @returns {ServiceFieldsPlan} Proposed records, changes and unresolved conflicts.
 * @throws {Error} When codes are duplicated/unmatched or a planned record is invalid.
 */
export function planServiceFields(records, snapshot, { clearUnverified = false } = {}) {
  const changes = []
  const conflicts = []
  const unsupported = []
  const codes = new Set()
  const planned = records.map(({ file, record }) => {
    const code = record.local_authority_code
    if (codes.has(code)) throw new Error(`Duplicate target authority code: ${code}`)
    codes.add(code)
    const source = snapshot.records[code]
    const updated = { ...record }
    if (!source) {
      if (record.adult_fine !== null || record.child_fine !== null) {
        unsupported.push({
          file,
          code,
          reason: 'No fine evidence in the pinned LibraryData source.'
        })
      }
      if (
        clearUnverified &&
        ['guernsey', 'jersey', 'isle-of-man'].includes(record.slug) &&
        record.adult_fine === 0 &&
        record.child_fine === 0
      ) {
        for (const field of ['adult_fine', 'child_fine']) {
          updated[field] = null
          changes.push({
            file,
            field,
            before: 0,
            after: null,
            reason: 'Unsubstantiated fine-free backfill removed by maintainer approval.'
          })
        }
      }
    } else {
      for (const [field, value] of Object.entries(source.fields)) {
        if (value === null) continue
        if (record[field] === null) {
          updated[field] = value
          changes.push({ file, field, before: null, after: value, source_id: source.source_id })
        } else if (record[field] !== value) {
          conflicts.push({
            file,
            field,
            current: record[field],
            source: value,
            source_id: source.source_id
          })
        }
      }
    }
    validateRecord(updated, 'authorities')
    return { file, record: updated }
  })
  const unmatched = Object.keys(snapshot.records).filter((code) => !codes.has(code))
  if (unmatched.length) throw new Error(`Unmatched source authority codes: ${unmatched.join(', ')}`)
  return { records: planned, changes, conflicts, unsupported }
}

/**
 * Preview or apply the service-field backfill, reusing the saved snapshot offline.
 * Preserve unrelated fields, dates, non-null editorial values and prior audit changes.
 * @param {{root?: string, apply?: boolean, clearUnverified?: boolean}} [options] - Workspace path, write opt-in and approved correction opt-in.
 * @returns {Promise<{changes: object[], conflicts: object[], unsupported: object[]}>} Import decisions.
 * @throws {Error} When downloading, reading, validation or writing fails.
 */
export async function importServiceFields({
  root = fileURLToPath(new URL('../../', import.meta.url)),
  apply = false,
  clearUnverified = false
} = {}) {
  const snapshotFile = path.join(root, 'migration', 'directory', 'service-fields.json')
  let snapshot
  if (existsSync(snapshotFile)) {
    snapshot = JSON.parse(readFileSync(snapshotFile, 'utf8'))
  } else {
    const response = await fetch(serviceFieldsSource)
    if (!response.ok) throw new Error(`Service source download failed (${response.status}).`)
    const bytes = Buffer.from(await response.arrayBuffer())
    snapshot = serviceFieldSnapshot(
      JSON.parse(bytes.toString('utf8')),
      serviceFieldsSource,
      createHash('sha256').update(bytes).digest('hex')
    )
  }
  const folder = path.join(root, 'src', 'content', 'authorities')
  const records = readdirSync(folder)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => ({ file, record: JSON.parse(readFileSync(path.join(folder, file), 'utf8')) }))
  const plan = planServiceFields(records, snapshot, { clearUnverified })
  if (apply) {
    const auditFile = path.join(root, 'migration', 'directory', 'service-fields-import.json')
    const previous = existsSync(auditFile)
      ? JSON.parse(readFileSync(auditFile, 'utf8'))
      : { changes: [] }
    for (const { file, record } of plan.records) {
      if (plan.changes.some((change) => change.file === file)) {
        writeFileSync(path.join(folder, file), `${JSON.stringify(record, null, 2)}\n`)
      }
    }
    writeFileSync(snapshotFile, `${JSON.stringify(snapshot, null, 2)}\n`)
    writeFileSync(
      auditFile,
      `${JSON.stringify(
        {
          source: snapshot.source,
          sha256: snapshot.sha256,
          policy:
            'Match unique GSS codes, fill null values only, retain editorial conflicts and preserve dates.',
          changes: [...previous.changes, ...plan.changes],
          conflicts: plan.conflicts,
          unsupported: plan.unsupported
        },
        null,
        2
      )}\n`
    )
  }
  return { changes: plan.changes, conflicts: plan.conflicts, unsupported: plan.unsupported }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const allowed = new Set(['--apply', '--clear-unverified'])
  for (const argument of process.argv.slice(2)) {
    if (!allowed.has(argument)) throw new Error(`Unknown argument: ${argument}`)
  }
  console.log(
    JSON.stringify(
      await importServiceFields({
        apply: process.argv.includes('--apply'),
        clearUnverified: process.argv.includes('--clear-unverified')
      }),
      null,
      2
    )
  )
}
