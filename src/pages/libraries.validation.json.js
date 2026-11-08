/**
 * @fileoverview Endpoint publishing validation reports for the nationwide library dataset.
 */

import { libraries } from '../lib/directory/directoryLoader.mjs'
import { libraryValidationReport } from '../lib/directory/exportHelpers.mjs'
import { sitePath } from '../lib/site/siteHelpers.mjs'

/**
 * Handle GET requests for the nationwide library validation report.
 * @returns {Response} JSON Response containing strict field failures, schema link, and record numbers.
 */
export function GET() {
  return Response.json({
    schema: sitePath('/schemas/libraries.json'),
    ...libraryValidationReport(libraries)
  })
}
