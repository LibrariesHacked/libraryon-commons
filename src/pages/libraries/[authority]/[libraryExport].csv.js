/**
 * @fileoverview Endpoint generating authority-scoped CSV downloads for complete and validated library subsets.
 */

import { authorities, libraries } from '../../../lib/directory.mjs'
import { libraryCsvResponse } from '../../../lib/helpers/exportHelpers.mjs'

/**
 * Return static paths for authority-scoped complete and validated library CSV export files.
 * @returns {Array<{params: {authority: string, libraryExport: string}, props: {entries: object[], validOnly: boolean, slug: string}}>} Static route definitions.
 */
export function getStaticPaths() {
  return authorities.flatMap((authority) =>
    [false, true].map((validOnly) => ({
      params: {
        authority: authority.slug,
        libraryExport: validOnly ? 'libraries.validated' : 'libraries'
      },
      props: {
        entries: libraries.filter((library) => library.authority === authority.slug),
        validOnly,
        slug: authority.slug
      }
    }))
  )
}

/**
 * Handle GET requests for authority-scoped library CSV exports.
 * @param {{props: {entries: object[], validOnly: boolean, slug: string}}} context - Route context with prerendered authority records.
 * @returns {Response} Schema-ordered CSV attachment Response.
 */
export const GET = ({ props }) =>
  libraryCsvResponse(props.entries, {
    validOnly: props.validOnly,
    filename: `libraries-${props.slug}${props.validOnly ? '.validated' : ''}.csv`
  })
