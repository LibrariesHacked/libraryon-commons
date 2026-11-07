/**
 * @fileoverview Endpoint providing record-scoped review details and evidence for directory maintainers.
 */

import { loadDirectoryReview } from '../../../../lib/helpers/reviewHelpers.mjs'

/**
 * Return static paths for all flagged directory review entries.
 * @returns {Array<{params: {kind: string, entry: string}, props: {row: object}}>} Static route definitions.
 */
export function getStaticPaths() {
  return loadDirectoryReview().map((row) => ({
    params: { kind: row.collection, entry: row.entry },
    props: { row }
  }))
}

/**
 * Handle GET requests for record review evidence data.
 * @param {{props: {row: object}}} context - Prerendered review row props.
 * @returns {Response} JSON response containing review evidence.
 */
export const GET = ({ props }) =>
  Response.json(props.row, { headers: { 'X-Robots-Tag': 'noindex, nofollow' } })
