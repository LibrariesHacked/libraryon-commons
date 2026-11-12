/**
 * @fileoverview Dynamic static endpoint publishing Public Libraries News archive extensions on-demand.
 */

import { getNewsArchiveStories } from '../../../lib/content/newsHelpers.mjs'

export function getStaticPaths() {
  return [
    { params: { range: '2020-2022' } },
    { params: { range: '2015-2019' } },
    { params: { range: '2010-2014' } }
  ]
}

export function GET({ params }) {
  const { range } = params
  const stories = getNewsArchiveStories(range)

  if (stories) {
    return new Response(JSON.stringify(stories), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800'
      }
    })
  }

  return new Response(JSON.stringify([]), {
    status: 404,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  })
}
