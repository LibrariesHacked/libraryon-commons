/**
 * @fileoverview Endpoint generating authority-scoped JSON validation reports for library datasets.
 */

import { authorities, libraries } from '../../../lib/directory.mjs'
import { libraryValidationReport } from '../../../lib/directory-export.mjs'
import { sitePath } from '../../../lib/site.mjs'

/**
 * Return static paths for authority-scoped validation reports.
 * @returns {Array<{params: {authority: string}, props: {entries: object[]}}>} Static route definitions.
 */
export function getStaticPaths() {
  return authorities.map((authority) => ({
    params: { authority: authority.slug },
    props: { entries: libraries.filter((library) => library.authority === authority.slug) }
  }))
}

/**
 * Handle GET requests for authority-scoped library validation reports.
 * @param {{props: {entries: object[]}}} context - Route context with prerendered authority records.
 * @returns {Response} JSON Response containing validation errors and schema reference.
 */
export const GET = ({ props }) =>
  Response.json({
    schema: sitePath('/schemas/libraries.json'),
    ...libraryValidationReport(props.entries)
  })
