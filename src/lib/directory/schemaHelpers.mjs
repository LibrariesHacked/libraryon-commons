/**
 * @fileoverview Table Schema validation, data constraint checks, and CMS entry normalization for directory records.
 */

import { z } from 'zod'
import libraries from '../../data/schemas/libraries.json' with { type: 'json' }
import services from '../../data/schemas/library-services.json' with { type: 'json' }
import { openingHours } from './openingHoursHelpers.mjs'

export const directorySchemas = { libraries, authorities: services }

const fieldTypeValidators = {
  integer: z.number().int().safe(),
  number: z.number().finite(),
  year: z.number().int().min(1000).max(9999),
  string: z.string().min(1)
}

const uriValidator = z.url({ protocol: /^https?$/ })
const emailValidator = z.email()

const recordFields = new Set([
  'id',
  'slug',
  'authority',
  'source_id',
  'source_url',
  'updated_on',
  'reviewed_on',
  'imported_on',
  'data',
  'validation_exceptions',
  'manual_checks'
])

const manualChecks = z.array(
  z
    .object({
      kind: z.string().min(1),
      reason: z.string().min(1),
      audit_refs: z
        .array(z.string().regex(/^migration\/directory\/report\.json#review_[a-f0-9]{24}$/))
        .min(1)
    })
    .strict()
)

/**
 * Check raw Table Schema values without applying migration validation exceptions.
 * Blank daily-hour inputs are accepted; canonical CMS saves normalize them to null.
 *
 * @param {Record<string, unknown>} data - Canonical schema-named field values.
 * @param {{fields: object[]}} schema - Supplied Table Schema specification.
 * @returns {Array<{field: string, code: string, value: unknown}>} Unwaived failures.
 */
export function dataIssues(data, schema) {
  const issues = []
  const names = new Set(schema.fields.map((field) => field.name))
  for (const key of Object.keys(data)) {
    if (!names.has(key)) issues.push({ field: key, code: 'unknown-field', value: data[key] })
  }
  for (const field of schema.fields) {
    const value = data[field.name]
    const constraints = field.constraints || {}
    const isSessionHours = field.type === 'string' && / (un)?staffed hours$/.test(field.name)
    const reportIssue = (code) => issues.push({ field: field.name, code, value: value ?? null })
    if (value === undefined) {
      reportIssue('missing-field')
      continue
    }
    if (value === null || (isSessionHours && value === '')) {
      if (constraints.required) reportIssue('required')
      continue
    }
    const validator = fieldTypeValidators[field.type]
    if (!validator?.safeParse(value).success) {
      reportIssue('type')
      continue
    }
    if (constraints.enum && !constraints.enum.includes(value)) reportIssue('enum')
    if (constraints.pattern && !new RegExp(constraints.pattern).test(value)) reportIssue('pattern')
    if (constraints.minimum !== undefined && value < constraints.minimum) reportIssue('minimum')
    if (constraints.maximum !== undefined && value > constraints.maximum) reportIssue('maximum')
    if (field.format === 'uri' && !uriValidator.safeParse(value).success) reportIssue('uri')
    if (field.format === 'email' && !emailValidator.safeParse(value).success) reportIssue('email')
    if (isSessionHours) {
      try {
        if (openingHours(value) !== value) reportIssue('hours-format')
      } catch {
        reportIssue('hours-format')
      }
    }
    if (field.name === 'Unique property reference number' && (value <= 0 || value > 999999999999)) {
      reportIssue('uprn-range')
    }
  }
  return issues
}

/**
 * Enforce the canonical record envelope and exact, non-stale exception matches.
 *
 * @param {object} record - Canonical record with schema data and review metadata.
 * @param {'libraries'|'authorities'} kind - Owning directory collection.
 * @returns {object} The original validated record, without mutation.
 */
export function validateRecord(record, kind) {
  const schema = directorySchemas[kind]
  if (!schema || !record.data || !record.slug) throw new Error(`Invalid ${kind} record`)
  for (const field of Object.keys(record)) {
    if (!recordFields.has(field)) {
      throw new Error(`${record.slug}: unexpected record field: ${field}`)
    }
  }
  if (record.manual_checks !== undefined && !manualChecks.safeParse(record.manual_checks).success) {
    throw new Error(`${record.slug}: invalid manual checks`)
  }
  const issues = dataIssues(record.data, schema)
  const exceptions = record.validation_exceptions || []
  for (const issue of issues) {
    if (
      [
        'unknown-field',
        'missing-field',
        'type',
        'hours-format',
        'uprn-range',
        'minimum',
        'maximum'
      ].includes(issue.code)
    ) {
      throw new Error(`${record.slug}: ${issue.field}: ${issue.code}`)
    }
    if (
      !exceptions.some(
        (item) =>
          item.field === issue.field &&
          item.code === issue.code &&
          JSON.stringify(item.value) === JSON.stringify(issue.value) &&
          item.reason
      )
    ) {
      throw new Error(`${record.slug}: ${issue.field}: ${issue.code}`)
    }
  }
  for (const exception of exceptions) {
    if (
      !issues.some(
        (issue) =>
          issue.field === exception.field &&
          issue.code === exception.code &&
          JSON.stringify(issue.value) === JSON.stringify(exception.value)
      )
    ) {
      throw new Error(`${record.slug}: stale validation exception for ${exception.field}`)
    }
  }
  return record
}

/**
 * Normalize a CMS entry in place, remove resolved exceptions and reject new bad values.
 *
 * @param {object} record - Mutable plain-object copy of a Decap entry.
 * @param {'libraries'|'authorities'} kind - Directory collection being saved.
 * @returns {Record<string, unknown> & {data: Record<string, unknown>, validation_exceptions: object[]}}
 */
export function prepareDirectoryEdit(record, kind) {
  const schema = directorySchemas[kind]
  if (!schema) throw new Error(`Unknown directory collection: ${kind}`)

  record.data = Object.fromEntries(
    schema.fields.map((field) => [
      field.name,
      record.data?.[field.name] === '' ? null : (record.data?.[field.name] ?? null)
    ])
  )
  record.validation_exceptions = dataIssues(record.data, schema).map((issue) => {
    const previous = record.validation_exceptions?.find(
      (item) =>
        item.field === issue.field &&
        item.code === issue.code &&
        JSON.stringify(item.value) === JSON.stringify(issue.value)
    )
    if (previous?.reason) return previous
    if (issue.code === 'required') {
      return { ...issue, reason: 'Not recorded; requires editorial verification' }
    }
    throw new Error(`${issue.field}: ${issue.code}`)
  })

  // Validate clean record without extra CMS-internal UI fields
  const cleanRecord = {}
  for (const key of Object.keys(record)) {
    if (recordFields.has(key)) {
      cleanRecord[key] = record[key]
    }
  }
  if (!cleanRecord.slug) {
    const rawName = record.data?.['Library name'] || record.data?.['Local authority'] || 'new-entry'
    cleanRecord.slug =
      String(rawName)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '') || 'new-entry'
  }
  validateRecord(cleanRecord, kind)

  return record
}

/**
 * Validate a collection and enforce the schema's non-null uniqueness constraints.
 *
 * @param {object[]} records - Complete collection.
 * @param {'libraries'|'authorities'} kind - Schema to apply to every record.
 * @returns {object[]} Validated records in their original order.
 */
export function validateRecords(records, kind) {
  const validatedRecords = records.map((record) => validateRecord(record, kind))
  const schema = directorySchemas[kind]
  const unique = schema.fields.filter((field) => field.constraints?.unique)
  for (const field of unique) {
    const seen = new Set()
    for (const record of validatedRecords) {
      const value = record.data[field.name]
      if (value === null) continue
      if (seen.has(value)) throw new Error(`Duplicate ${kind} ${field.name}: ${value}`)
      seen.add(value)
    }
  }
  return validatedRecords
}
