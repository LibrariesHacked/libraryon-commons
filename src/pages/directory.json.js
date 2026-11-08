/**
 * @fileoverview Endpoint publishing the active library directory index in compacted JSON format.
 */

import { searchRecords } from '../lib/directory/directoryLoader.mjs'
import { compactDirectory } from '../lib/directory/searchHelpers.mjs'

/**
 * Handle GET requests for the active library directory search index.
 * @returns {Response} Compacted JSON directory Response.
 */
export function GET() {
  const activeRecords = searchRecords.filter((record) => !record.closed)
  return new Response(JSON.stringify(compactDirectory(activeRecords)), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  })
}
