/**
 * @fileoverview Endpoint publishing the compacted Public Libraries News index for client-side search and map filtering.
 */

import { getNewsIndexStories } from '../lib/content/newsHelpers.mjs'

/**
 * Return the compact news index used by client-side search and map filtering.
 * @returns {Response} JSON response containing the indexed stories.
 */
export function GET() {
  const stories = getNewsIndexStories()
  return new Response(JSON.stringify(stories), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=3600'
    }
  })
}
