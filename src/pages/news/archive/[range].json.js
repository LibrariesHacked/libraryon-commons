/**
 * @fileoverview Dynamic static endpoint publishing Public Libraries News archive extensions on-demand.
 */

import { existsSync, readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

export function getStaticPaths() {
  return [
    { params: { range: '2020-2022' } },
    { params: { range: '2015-2019' } },
    { params: { range: '2010-2014' } }
  ]
}

export function GET({ params }) {
  const { range } = params
  const localUrl = new URL(`../../../data/news/archive-${range}.json`, import.meta.url)
  const rootUrl = new URL(
    `./src/data/news/archive-${range}.json`,
    pathToFileURL(`${process.cwd()}/`)
  )
  const fileUrl = existsSync(localUrl) ? localUrl : rootUrl

  if (existsSync(fileUrl)) {
    const data = readFileSync(fileUrl, 'utf8')
    return new Response(data, {
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
