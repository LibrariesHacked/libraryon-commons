import { stringify } from 'csv-stringify/sync'
import { dataIssues, directorySchemas } from './directory-schema.mjs'

/** @typedef {{id?: string | number, data: import('./directory-types.ts').LibraryData}} ExportLibrary */

const librarySchema = directorySchemas.libraries
const csvColumns = librarySchema.fields.map((field) => field.name)

/**
 * Report unwaived schema failures, retaining the complete export's record numbers.
 * Record numbers count the header, not physical lines inside quoted CSV cells.
 * @param {ExportLibrary[]} records - Canonical library records in export order.
 * @returns {{totalRecords: number, validRecords: number, invalidRecords: number, issues: object[]}}
 */
export function libraryValidationReport(records) {
  const issues = records.flatMap((record, index) =>
    dataIssues(record.data, librarySchema).map((issue) => ({
      id: record.id,
      name: record.data['Library name'],
      csvRecord: index + 2,
      ...issue
    }))
  )
  const invalidRecordNumbers = new Set(issues.map((issue) => issue.csvRecord))
  return {
    totalRecords: records.length,
    validRecords: records.length - invalidRecordNumbers.size,
    invalidRecords: invalidRecordNumbers.size,
    issues
  }
}

/**
 * Serialize canonical fields in schema order, with RFC-style quoting and blank nulls.
 * The complete export retains validation gaps; validOnly never applies exceptions.
 * @param {ExportLibrary[]} records - Records to serialize, including closed buildings.
 * @param {{validOnly?: boolean}} [options] - Whether to omit schema-invalid records.
 * @returns {string} CSV with a header even when no records qualify.
 */
export function libraryCsv(records, { validOnly = false } = {}) {
  const selectedRecords = validOnly
    ? records.filter((record) => !dataIssues(record.data, librarySchema).length)
    : records
  return stringify(
    selectedRecords.map((record) => csvColumns.map((field) => record.data[field])),
    { header: true, columns: csvColumns, record_delimiter: '\r\n' }
  )
}

/**
 * Return the CSV download response used by global and authority-scoped endpoints.
 * @param {ExportLibrary[]} records - Canonical records selected by the route.
 * @param {{validOnly?: boolean, filename?: string}} [options] - Export and download name.
 * @returns {Response} UTF-8 CSV attachment; static hosts also use the link's filename.
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
