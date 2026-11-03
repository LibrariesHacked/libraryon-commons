import { searchRecords } from '../lib/directory.mjs'
import { compactDirectory } from '../lib/search.mjs'

/** Publish only fields needed by browser search, never the full source snapshot. */
export function GET() {
  return new Response(JSON.stringify(compactDirectory(searchRecords)), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  })
}
