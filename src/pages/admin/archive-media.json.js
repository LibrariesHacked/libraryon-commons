/**
 * @fileoverview Build-time read-only manifest of preserved archive assets.
 */

import { readdirSync } from 'node:fs'

/**
 * Prerender the archive manifest from actual filenames without reading file contents.
 * @returns {Response} JSON archive assets with encoded URLs and noindex headers.
 */
export const GET = () =>
  Response.json(
    readdirSync(new URL('../../../public/uploads/archive/', import.meta.url))
      .filter((name) => !name.startsWith('.'))
      .sort()
      .map((name) => ({
        name,
        url: `/uploads/archive/${encodeURIComponent(name)}`,
        image: /\.(?:jpe?g|png|gif|webp|avif|svg)$/i.test(name)
      })),
    { headers: { 'X-Robots-Tag': 'noindex, nofollow' } }
  )
