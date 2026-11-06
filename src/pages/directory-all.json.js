/**
 * @fileoverview Endpoint publishing the complete library directory index (including closed libraries) in compacted JSON format.
 */

import { searchRecords } from '../lib/directory.mjs'
import { compactDirectory } from '../lib/search.mjs'

/**
 * Handle GET requests for the complete library directory search index including closed buildings.
 * @returns {Response} Compacted JSON directory Response.
 */
export function GET() {
  return new Response(JSON.stringify(compactDirectory(searchRecords)), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  })
}
