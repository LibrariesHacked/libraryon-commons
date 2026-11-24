/**
 * @fileoverview Export generation for CSV downloads and Table Schema validation reports.
 */

import { stringify } from 'csv-stringify/sync'
import { dataIssues, directorySchemas, FIELD_ALIASES } from './schemaHelpers.mjs'

const librarySchema = directorySchemas.libraries
const csvColumns = librarySchema.fields.map((field) => field.name)
const reportCache = new WeakMap()

/**
 * Report unwaived schema failures, retaining the complete export's record numbers.
 *
 * @param {Array<object>} records - Canonical library records in export order.
 * @returns {{totalRecords: number, validRecords: number, invalidRecords: number, issues: object[]}}
 */
export function libraryValidationReport(records) {
  if (Array.isArray(records) && reportCache.has(records)) {
    return reportCache.get(records)
  }
  const issues = records.flatMap((record, index) => {
    const data = record.data || record
    return dataIssues(data, librarySchema).map((issue) => ({
      id: record.id,
      name: data['Library name'] || data.library_name,
      csvRecord: index + 2,
      ...issue
    }))
  })
  const invalidRecordNumbers = new Set(issues.map((issue) => issue.csvRecord))
  const report = {
    totalRecords: records.length,
    validRecords: records.length - invalidRecordNumbers.size,
    invalidRecords: invalidRecordNumbers.size,
    issues
  }
  if (Array.isArray(records)) {
    reportCache.set(records, report)
  }
  return report
}

/**
 * Serialize canonical fields in schema order, with RFC-style quoting and blank nulls.
 *
 * @param {Array<object>} records - Records to serialize.
 * @param {{validOnly?: boolean}} [options] - Whether to omit schema-invalid records.
 * @returns {string} CSV with header.
 */
export function libraryCsv(records, { validOnly = false } = {}) {
  const selectedRecords = validOnly
    ? records.filter((record) => !dataIssues(record.data || record, librarySchema).length)
    : records
  return stringify(
    selectedRecords.map((record) => {
      const data = record.data || record
      return librarySchema.fields.map((field) => {
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
        return data[key] ?? null
      })
    }),
    { header: true, columns: csvColumns, record_delimiter: '\r\n' }
  )
}

/**
 * Return the CSV download response used by global and authority-scoped endpoints.
 *
 * @param {Array<object>} records - Canonical records selected by the route.
 * @param {{validOnly?: boolean, filename?: string}} [options] - Export and download name.
 * @returns {Response} UTF-8 CSV attachment.
 */
export function libraryCsvResponse(
  records,
  { validOnly = false, filename = 'libraries.csv' } = {}
) {
  return new Response(libraryCsv(records, { validOnly }), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'X-Content-Type-Options': 'nosniff'
    }
  })
}
