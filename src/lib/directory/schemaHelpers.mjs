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
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  string: z.string().min(1)
}

const uriValidator = z.url({ protocol: /^https?$/ })
const emailValidator = z.email()

const metadataFields = new Set([
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

export const FIELD_ALIASES = new Map([
  ['Unique property reference number', 'unique_property_reference_number'],
  ['Unique Property Reference Number (UPRN)', 'unique_property_reference_number'],
  ['URL', 'url'],
  ['Website URL', 'url']
])

/**
 * Look up the human-readable title for a schema field, falling back to its name.
 *
 * @param {string} fieldName - Schema field name or alias.
 * @param {'libraries'|'authorities'} [kind='libraries'] - Owning directory collection.
 * @returns {string} Human-readable title for display to users.
 */
export function getFieldTitle(fieldName, kind = 'libraries') {
  const schema = directorySchemas[kind] || directorySchemas.libraries
  const canonicalName = FIELD_ALIASES.get(fieldName) || fieldName
  const field = schema.fields.find((f) => f.name === canonicalName || f.title === fieldName)
  return field?.title || fieldName
}

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
  const names = new Set(schema.fields.flatMap((field) => [field.name, field.title].filter(Boolean)))
  for (const [alias, canonicalName] of FIELD_ALIASES) {
    if (schema.fields.some((f) => f.name === canonicalName)) {
      names.add(alias)
    }
  }
  for (const key of Object.keys(data)) {
    if (metadataFields.has(key)) continue
    if (!names.has(key)) issues.push({ field: key, code: 'unknown-field', value: data[key] })
  }
  for (const field of schema.fields) {
    const candidateKeys = [
      field.name,
      field.title,
      ...[...FIELD_ALIASES.entries()]
        .filter(([, canonicalName]) => canonicalName === field.name)
        .map(([alias]) => alias)
    ].filter(Boolean)

    const key =
      candidateKeys.find((k) => data[k] !== undefined && data[k] !== null) ||
      candidateKeys.find((k) => k in data) ||
      field.name
    const value = data[key]
    const constraints = field.constraints || {}
    const isSessionHours =
      field.type === 'string' &&
      (/ (un)?staffed hours$/.test(field.title || field.name) ||
        /_(un)?staffed_hours$/.test(field.name))
    const reportField = field.name
    const reportIssue = (code) => issues.push({ field: reportField, code, value: value ?? null })
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
    if (
      (field.name === 'unique_property_reference_number' ||
        field.name === 'Unique property reference number' ||
        field.title === 'Unique property reference number') &&
      (value <= 0 || value > 999999999999)
    ) {
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
  const hasCanonicalData = Boolean(
    record?.data ||
    (kind === 'libraries'
      ? record?.['library_name'] || record?.['Library name']
      : record?.['local_authority'] || record?.['Local authority'])
  )
  if (!schema || !hasCanonicalData || !record?.slug) throw new Error(`Invalid ${kind} record`)
  const allowedFields = new Set([
    ...metadataFields,
    ...schema.fields.flatMap((field) => [field.name, field.title].filter(Boolean)),
    ...[...FIELD_ALIASES.entries()]
      .filter(([, targetName]) => schema.fields.some((f) => f.name === targetName))
      .map(([alias]) => alias)
  ])
  for (const field of Object.keys(record)) {
    if (!allowedFields.has(field)) {
      throw new Error(`${record.slug}: unexpected record field: ${field}`)
    }
  }
  if (record.manual_checks !== undefined && !manualChecks.safeParse(record.manual_checks).success) {
    throw new Error(`${record.slug}: invalid manual checks`)
  }
  const data = record.data || record
  const issues = dataIssues(data, schema)
  const exceptions = record.validation_exceptions || []
  const fieldByName = new Map(schema.fields.map((f) => [f.name, f]))
  const fieldByTitle = new Map(schema.fields.filter((f) => f.title).map((f) => [f.title, f]))
  for (const [alias, targetName] of FIELD_ALIASES) {
    const field = fieldByName.get(targetName)
    if (field && !fieldByTitle.has(alias)) fieldByTitle.set(alias, field)
  }
  const resolveCanonicalName = (fieldName) =>
    fieldByName.get(fieldName)?.name ||
    fieldByTitle.get(fieldName)?.name ||
    FIELD_ALIASES.get(fieldName) ||
    fieldName
  const matchesField = (f1, f2) =>
    f1 === f2 || resolveCanonicalName(f1) === resolveCanonicalName(f2)
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
          matchesField(item.field, issue.field) &&
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
          matchesField(issue.field, exception.field) &&
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

  const sourceData = record.data || record
  for (const field of schema.fields) {
    const keys = [field.name, field.title].filter((k) => k && k in sourceData)
    if (!keys.length) keys.push(field.name)
    for (const key of keys) {
      const raw = sourceData[key] ?? record[key]
      const normalized = raw === '' ? null : (raw ?? null)
      record[key] = normalized
      if (record.data) {
        record.data[key] = normalized
      }
    }
  }

  record.validation_exceptions = dataIssues(record, schema).map((issue) => {
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
  const allowedFields = new Set([
    ...metadataFields,
    ...schema.fields.flatMap((field) => [field.name, field.title].filter(Boolean))
  ])
  const cleanRecord = {}
  for (const key of Object.keys(record)) {
    if (allowedFields.has(key)) {
      cleanRecord[key] = record[key]
    }
  }
  if (!cleanRecord.slug) {
    const rawName =
      record['Library name'] ||
      record['library_name'] ||
      record['Local authority'] ||
      record['local_authority'] ||
      record.data?.['Library name'] ||
      record.data?.['library_name'] ||
      record.data?.['Local authority'] ||
      record.data?.['local_authority'] ||
      'new-entry'
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
      const data = record.data || record
      const key =
        field.name in data
          ? field.name
          : field.title && field.title in data
            ? field.title
            : field.name
      const value = data[key]
      if (value === null) continue
      if (seen.has(value)) throw new Error(`Duplicate ${kind} ${key}: ${value}`)
      seen.add(value)
    }
  }
  return validatedRecords
}
