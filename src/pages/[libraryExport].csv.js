/**
 * @fileoverview Endpoint generating complete and validated nationwide library CSV export files.
 */

import { libraries } from '../lib/directory.mjs'
import { libraryCsvResponse } from '../lib/helpers/exportHelpers.mjs'

/**
 * Return static paths for complete and validated library CSV export files.
 * @returns {Array<{params: {libraryExport: string}, props: {validOnly: boolean}}>} Static route definitions.
 */
export function getStaticPaths() {
  return [false, true].map((validOnly) => ({
    params: { libraryExport: validOnly ? 'libraries.validated' : 'libraries' },
    props: { validOnly }
  }))
}

/**
 * Handle GET requests for nationwide library CSV exports.
 * @param {{props: {validOnly: boolean}}} context - Static route context.
 * @returns {Response} Schema-ordered CSV attachment Response.
 */
export const GET = ({ props }) =>
  libraryCsvResponse(libraries, {
    validOnly: props.validOnly,
    filename: props.validOnly ? 'libraries.validated.csv' : 'libraries.csv'
  })
