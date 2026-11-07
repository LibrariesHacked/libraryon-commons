/**
 * @fileoverview Endpoint publishing the compacted Public Libraries News index for client-side search and map filtering.
 */

import { existsSync, readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

export function GET() {
  const localUrl = new URL('../data/news/news-index.json', import.meta.url)
  const rootUrl = new URL('./src/data/news/news-index.json', pathToFileURL(`${process.cwd()}/`))
  const fileUrl = existsSync(localUrl) ? localUrl : rootUrl
  if (existsSync(fileUrl)) {
    const data = readFileSync(fileUrl, 'utf8')
    return new Response(data, {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=3600'
      }
    })
  }
  return new Response(JSON.stringify([]), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  })
}
