import type { APIRoute } from 'astro'
import { loadDirectoryReview } from '../../../../lib/directory-review.mjs'

/** @returns Detail routes only for current flagged records, with ownership-checked evidence. */
export function getStaticPaths() {
  return loadDirectoryReview().map((row) => ({
    params: { kind: row.collection, entry: row.entry },
    props: { row }
  }))
}

/** @param context - Prerendered record-scoped review details. @returns Public read-only evidence marked noindex, not an authenticated API. */
export const GET: APIRoute = ({ props }) =>
  Response.json(props.row, { headers: { 'X-Robots-Tag': 'noindex, nofollow' } })
